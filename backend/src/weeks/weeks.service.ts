import { Injectable, NotFoundException } from '@nestjs/common';
import { Week, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlocksService } from '../blocks/blocks.service';
import { PublicWeek, toPublicWeek } from './week.mapper';
import { CreateWeekDto } from './dto/create-week.dto';
import { UpdateWeekDto } from './dto/update-week.dto';

const GENERIC_WEEK_NOT_FOUND = 'Semana no encontrada';

type WeekWithChain = Week & { block: { program: { coachId: string } } };

// ---------------------------------------------------------------------------
// Semanas del Coach (PROMPT 08). Segundo nivel de la cadena de propiedad
// indirecta: Week -> Block -> Program -> coachId. `findOwnedWeekOrThrow`
// resuelve la cadena completa en una única consulta anidada
// (`include: { block: { include: { program: true } } }`), igual criterio
// que BlocksService un nivel más arriba.
// ---------------------------------------------------------------------------
@Injectable()
export class WeeksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocksService: BlocksService,
  ) {}

  private ensureOwnedWeek(
    coachId: string,
    week: WeekWithChain | null,
  ): WeekWithChain {
    if (!week || week.block.program.coachId !== coachId) {
      throw new NotFoundException(GENERIC_WEEK_NOT_FOUND);
    }
    return week;
  }

  async findOwnedWeekOrThrow(
    coachId: string,
    weekId: string,
  ): Promise<WeekWithChain> {
    const week = await this.prisma.week.findUnique({
      where: { id: weekId },
      include: {
        block: { include: { program: { select: { coachId: true } } } },
      },
    });
    return this.ensureOwnedWeek(coachId, week as WeekWithChain | null);
  }

  async listForBlock(coachId: string, blockId: string): Promise<PublicWeek[]> {
    await this.blocksService.findOwnedBlockOrThrow(coachId, blockId);

    const weeks = await this.prisma.week.findMany({
      where: { blockId },
      orderBy: { order: 'asc' },
    });
    return weeks.map(toPublicWeek);
  }

  async getOwnedByCoach(coachId: string, weekId: string): Promise<PublicWeek> {
    const week = await this.findOwnedWeekOrThrow(coachId, weekId);
    return toPublicWeek(week);
  }

  // Misma estrategia atómica que BlocksService.create (ver ese comentario
  // para el detalle completo): inserta al final si no se especifica `order`,
  // o abre espacio corriendo los hermanos existentes dentro de una
  // transacción.
  async create(
    coachId: string,
    blockId: string,
    dto: CreateWeekDto,
  ): Promise<PublicWeek> {
    await this.blocksService.findOwnedBlockOrThrow(coachId, blockId);

    const created = await this.prisma.$transaction(async (tx) => {
      let order = dto.order;
      if (order === undefined) {
        const max = await tx.week.aggregate({
          where: { blockId },
          _max: { order: true },
        });
        order = (max._max.order ?? 0) + 1;
      } else {
        await tx.week.updateMany({
          where: { blockId, order: { gte: order } },
          data: { order: { increment: 1 } },
        });
      }
      return tx.week.create({
        data: { blockId, number: dto.number, order },
      });
    });

    return toPublicWeek(created);
  }

  async update(
    coachId: string,
    weekId: string,
    dto: UpdateWeekDto,
  ): Promise<PublicWeek> {
    const week = await this.findOwnedWeekOrThrow(coachId, weekId);

    if (dto.order !== undefined && dto.order !== week.order) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.shiftOrder(tx, week.blockId, week.order, dto.order!);
        const data: Prisma.WeekUpdateInput = { order: dto.order };
        if (dto.number !== undefined) data.number = dto.number;
        return tx.week.update({ where: { id: weekId }, data });
      });
      return toPublicWeek(updated);
    }

    const data: Prisma.WeekUpdateInput = {};
    if (dto.number !== undefined) data.number = dto.number;

    const updated = await this.prisma.week.update({
      where: { id: weekId },
      data,
    });
    return toPublicWeek(updated);
  }

  private async shiftOrder(
    tx: Prisma.TransactionClient,
    blockId: string,
    oldOrder: number,
    newOrder: number,
  ): Promise<void> {
    if (newOrder > oldOrder) {
      await tx.week.updateMany({
        where: { blockId, order: { gt: oldOrder, lte: newOrder } },
        data: { order: { decrement: 1 } },
      });
    } else {
      await tx.week.updateMany({
        where: { blockId, order: { gte: newOrder, lt: oldOrder } },
        data: { order: { increment: 1 } },
      });
    }
  }
}
