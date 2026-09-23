import { Injectable, NotFoundException } from '@nestjs/common';
import { Block, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgramsService } from '../programs/programs.service';
import { PublicBlock, toPublicBlock } from './block.mapper';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

const GENERIC_BLOCK_NOT_FOUND = 'Bloque no encontrado';

type BlockWithProgram = Block & { program: { coachId: string } };

// ---------------------------------------------------------------------------
// Bloques del Coach (PROMPT 08). Primer nivel de la cadena de propiedad
// multi-nivel: un Block no tiene `coachId` propio, pertenece a un Coach de
// forma INDIRECTA a traves de `Block.program.coachId`. El chequeo de
// propiedad (`ensureOwnedBlock`) siempre carga el Block junto con su Program
// en una unica consulta (`include: { program: true }`) — nunca se confia en
// que el `programId` recibido del cliente coincida con el Block solicitado
// sin verificarlo contra la base de datos.
//
// `findOwnedBlockOrThrow`/`ensureOwnedBlock` responden 404 (nunca 403) tanto
// si el Block no existe como si pertenece (via su Program) a otro coach —
// mismo criterio ya establecido para Student/Exercise/Program.
// ---------------------------------------------------------------------------
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programsService: ProgramsService,
  ) {}

  private ensureOwnedBlock(
    coachId: string,
    block: BlockWithProgram | null,
  ): BlockWithProgram {
    if (!block || block.program.coachId !== coachId) {
      throw new NotFoundException(GENERIC_BLOCK_NOT_FOUND);
    }
    return block;
  }

  async findOwnedBlockOrThrow(
    coachId: string,
    blockId: string,
  ): Promise<BlockWithProgram> {
    const block = await this.prisma.block.findUnique({
      where: { id: blockId },
      include: { program: { select: { coachId: true } } },
    });
    return this.ensureOwnedBlock(coachId, block as BlockWithProgram | null);
  }

  // GET /programs/:programId/blocks — no se pagina: un programa acumula un
  // número acotado de bloques (a diferencia de /students o /exercises, que
  // pueden crecer sin límite práctico), así que se devuelven todos ordenados
  // por `order`.
  async listForProgram(
    coachId: string,
    programId: string,
  ): Promise<PublicBlock[]> {
    await this.programsService.findOwnedProgramOrThrow(coachId, programId);

    const blocks = await this.prisma.block.findMany({
      where: { programId },
      orderBy: { order: 'asc' },
    });
    return blocks.map(toPublicBlock);
  }

  async getOwnedByCoach(
    coachId: string,
    blockId: string,
  ): Promise<PublicBlock> {
    const block = await this.findOwnedBlockOrThrow(coachId, blockId);
    return toPublicBlock(block);
  }

  // POST /programs/:programId/blocks — operación atómica (PROMPT 08, "usa
  // transacciones cuando una operación requiera múltiples modificaciones
  // relacionadas"): si el coach no especifica `order`, se asigna al final;
  // si especifica una posición ya ocupada, se "abre espacio" corriendo hacia
  // adelante el `order` de los bloques existentes >= esa posición, todo
  // dentro de la misma transacción para nunca dejar dos bloques con el mismo
  // `order` (constraint `@@unique([programId, order])`) ni un estado a medio
  // correr si algo falla.
  async create(
    coachId: string,
    programId: string,
    dto: CreateBlockDto,
  ): Promise<PublicBlock> {
    await this.programsService.findOwnedProgramOrThrow(coachId, programId);

    const created = await this.prisma.$transaction(async (tx) => {
      let order = dto.order;
      if (order === undefined) {
        const max = await tx.block.aggregate({
          where: { programId },
          _max: { order: true },
        });
        order = (max._max.order ?? 0) + 1;
      } else {
        await tx.block.updateMany({
          where: { programId, order: { gte: order } },
          data: { order: { increment: 1 } },
        });
      }
      return tx.block.create({ data: { programId, name: dto.name, order } });
    });

    return toPublicBlock(created);
  }

  // PATCH /blocks/:id — edita nombre y/o orden. Un cambio de `order` también
  // se resuelve dentro de una transacción: se corren los bloques
  // intermedios un paso en la dirección correspondiente antes de fijar el
  // nuevo valor, para nunca violar el índice único `(programId, order)` a
  // mitad de camino.
  async update(
    coachId: string,
    blockId: string,
    dto: UpdateBlockDto,
  ): Promise<PublicBlock> {
    const block = await this.findOwnedBlockOrThrow(coachId, blockId);

    if (dto.order !== undefined && dto.order !== block.order) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.shiftOrder(tx, block.programId, block.order, dto.order!);
        const data: Prisma.BlockUpdateInput = { order: dto.order };
        if (dto.name !== undefined) data.name = dto.name;
        return tx.block.update({ where: { id: blockId }, data });
      });
      return toPublicBlock(updated);
    }

    const data: Prisma.BlockUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;

    const updated = await this.prisma.block.update({
      where: { id: blockId },
      data,
    });
    return toPublicBlock(updated);
  }

  // Corre hacia atrás/adelante el `order` de los bloques hermanos ubicados
  // entre la posición vieja y la nueva, dejando exactamente un hueco libre
  // en `newOrder` para el bloque que se está moviendo (algoritmo clásico de
  // "mover un elemento dentro de una lista ordenada").
  private async shiftOrder(
    tx: Prisma.TransactionClient,
    programId: string,
    oldOrder: number,
    newOrder: number,
  ): Promise<void> {
    if (newOrder > oldOrder) {
      await tx.block.updateMany({
        where: { programId, order: { gt: oldOrder, lte: newOrder } },
        data: { order: { decrement: 1 } },
      });
    } else {
      await tx.block.updateMany({
        where: { programId, order: { gte: newOrder, lt: oldOrder } },
        data: { order: { increment: 1 } },
      });
    }
  }
}
