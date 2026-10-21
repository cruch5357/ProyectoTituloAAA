import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogItemDto,
  CreateLibraryBlockDto,
  SaveLibraryBlockDto,
} from './library.dto';
import { libraryTree, libraryView, treeCreate } from './library-tree';

const normalize = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
@Injectable()
export class BlockLibraryService {
  constructor(private readonly prisma: PrismaService) {}
  private async owned(
    tx: Prisma.TransactionClient,
    coachId: string,
    id: string,
  ) {
    const block = await tx.block.findFirst({
      where: { id, coachId, programId: null },
      include: libraryTree,
    });
    if (!block) throw new NotFoundException('Bloque no encontrado');
    return block;
  }
  private async folder(
    tx: Prisma.TransactionClient,
    coachId: string,
    id?: string | null,
  ) {
    if (id && !(await tx.blockFolder.findFirst({ where: { id, coachId } })))
      throw new NotFoundException('Carpeta no encontrada');
  }
  list(coachId: string) {
    return this.prisma.block
      .findMany({
        where: { coachId, programId: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          folderId: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { weeks: true } },
        },
      })
      .then((rows) =>
        rows.map(({ _count, ...b }) => ({ ...b, weekCount: _count.weeks })),
      );
  }
  async get(coachId: string, id: string) {
    return libraryView(await this.owned(this.prisma, coachId, id));
  }
  async create(coachId: string, dto: CreateLibraryBlockDto) {
    await this.folder(this.prisma, coachId, dto.folderId);
    return this.prisma.block
      .create({
        data: {
          coachId,
          name: dto.name,
          folderId: dto.folderId,
          order: 1,
          weeks: {
            create: Array.from({ length: dto.weekCount }, (_, i) => ({
              number: i + 1,
              order: i + 1,
            })),
          },
        },
        include: libraryTree,
      })
      .then(libraryView);
  }
  async save(coachId: string, id: string, dto: SaveLibraryBlockDto) {
    const weeks = treeCreate(dto.weeks);
    return this.prisma.$transaction(
      async (tx) => {
        // Lock before loading revision; two concurrent saves cannot both pass.
        await tx.$queryRaw`SELECT id FROM blocks WHERE id = ${id} FOR UPDATE`;
        const current = await this.owned(tx, coachId, id);
        if (current.revision !== dto.revision)
          throw new ConflictException(
            'El bloque cambió en otra pestaña. Conserva tus cambios y vuelve a abrirlo antes de guardar.',
          );
        await this.folder(tx, coachId, dto.folderId);
        const exerciseIds = [
          ...new Set(
            dto.weeks.flatMap((w) =>
              w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
            ),
          ),
        ];
        const count = await tx.exercise.count({
          where: { id: { in: exerciseIds }, coachId },
        });
        if (count !== exerciseIds.length)
          throw new BadRequestException('Ejercicio ajeno o inexistente');
        // Only independent library blocks enter this endpoint: no execution or assignment can reference this tree.
        await tx.week.deleteMany({ where: { blockId: id } });
        return libraryView(
          await tx.block.update({
            where: { id },
            data: {
              name: dto.name,
              folderId: dto.folderId ?? null,
              revision: { increment: 1 },
              weeks: { create: weeks },
            },
            include: libraryTree,
          }),
        );
      },
      { timeout: 30000 },
    );
  }
  async duplicate(coachId: string, id: string) {
    const source = await this.owned(this.prisma, coachId, id);
    const view = libraryView(source);
    return this.prisma.block
      .create({
        data: {
          coachId,
          name: `${source.name.slice(0, 150)} (copia)`,
          folderId: source.folderId,
          order: 1,
          weeks: {
            create: treeCreate(
              view.weeks as SaveLibraryBlockDto['weeks'],
              true,
            ),
          },
        },
        include: libraryTree,
      })
      .then(libraryView);
  }
  async remove(coachId: string, id: string) {
    await this.owned(this.prisma, coachId, id);
    await this.prisma.block.delete({ where: { id } });
    return { id };
  }
  folders(coachId: string) {
    return this.prisma.blockFolder.findMany({
      where: { coachId },
      orderBy: { name: 'asc' },
    });
  }
  createFolder(coachId: string, name: string) {
    return this.prisma.blockFolder.upsert({
      where: {
        coachId_normalizedName: { coachId, normalizedName: normalize(name) },
      },
      create: { coachId, name, normalizedName: normalize(name) },
      update: {},
    });
  }
  async catalog(coachId: string) {
    const [exercises, modifiers] = await Promise.all([
      this.prisma.exercise.findMany({
        where: { coachId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, muscleGroup: true },
      }),
      this.prisma.exerciseModifier.findMany({
        where: { coachId },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return {
      exercises: exercises.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.muscleGroup || 'General',
      })),
      modifiers,
    };
  }
  async createCatalog(
    coachId: string,
    kind: 'exercise' | 'modifier',
    dto: CatalogItemDto,
  ) {
    if (kind === 'modifier')
      return this.prisma.exerciseModifier.upsert({
        where: {
          coachId_normalizedName: {
            coachId,
            normalizedName: normalize(dto.name),
          },
        },
        create: {
          coachId,
          name: dto.name,
          category: dto.category,
          normalizedName: normalize(dto.name),
        },
        update: {},
      });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${coachId} FOR UPDATE`;
      const existing = (
        await tx.exercise.findMany({ where: { coachId } })
      ).find((e) => normalize(e.name) === normalize(dto.name));
      const exercise = existing
        ? await tx.exercise.update({
            where: { id: existing.id },
            data: { isActive: true },
          })
        : await tx.exercise.create({
            data: { coachId, name: dto.name, muscleGroup: dto.category },
          });
      return {
        id: exercise.id,
        name: exercise.name,
        category: exercise.muscleGroup || 'General',
      };
    });
  }
}
