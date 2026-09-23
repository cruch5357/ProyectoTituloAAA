import { Injectable, NotFoundException } from '@nestjs/common';
import { Session, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WeeksService } from '../weeks/weeks.service';
import { PublicSession, toPublicSession } from './session.mapper';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

const GENERIC_SESSION_NOT_FOUND = 'Sesión no encontrada';

type SessionWithChain = Session & {
  week: { block: { program: { coachId: string } } };
};

// ---------------------------------------------------------------------------
// Sesiones del Coach (PROMPT 08). Tercer nivel de la cadena de propiedad
// indirecta: Session -> Week -> Block -> Program -> coachId, resuelta en una
// única consulta anidada (`findOwnedSessionOrThrow`). No implementa NINGÚN
// endpoint de registro/ejecución real (WorkoutLog/SetLog): esta capa
// representa exclusivamente la PRESCRIPCIÓN (qué sesión existe y en qué
// orden), fuera de alcance de PROMPT 08 según docs/roadmap.md.
// ---------------------------------------------------------------------------
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weeksService: WeeksService,
  ) {}

  private ensureOwnedSession(
    coachId: string,
    session: SessionWithChain | null,
  ): SessionWithChain {
    if (!session || session.week.block.program.coachId !== coachId) {
      throw new NotFoundException(GENERIC_SESSION_NOT_FOUND);
    }
    return session;
  }

  async findOwnedSessionOrThrow(
    coachId: string,
    sessionId: string,
  ): Promise<SessionWithChain> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        week: {
          include: {
            block: { include: { program: { select: { coachId: true } } } },
          },
        },
      },
    });
    return this.ensureOwnedSession(coachId, session as SessionWithChain | null);
  }

  async listForWeek(coachId: string, weekId: string): Promise<PublicSession[]> {
    await this.weeksService.findOwnedWeekOrThrow(coachId, weekId);

    const sessions = await this.prisma.session.findMany({
      where: { weekId },
      orderBy: { order: 'asc' },
    });
    return sessions.map(toPublicSession);
  }

  async getOwnedByCoach(
    coachId: string,
    sessionId: string,
  ): Promise<PublicSession> {
    const session = await this.findOwnedSessionOrThrow(coachId, sessionId);
    return toPublicSession(session);
  }

  // Misma estrategia atómica que Block/Week.create.
  async create(
    coachId: string,
    weekId: string,
    dto: CreateSessionDto,
  ): Promise<PublicSession> {
    await this.weeksService.findOwnedWeekOrThrow(coachId, weekId);

    const created = await this.prisma.$transaction(async (tx) => {
      let order = dto.order;
      if (order === undefined) {
        const max = await tx.session.aggregate({
          where: { weekId },
          _max: { order: true },
        });
        order = (max._max.order ?? 0) + 1;
      } else {
        await tx.session.updateMany({
          where: { weekId, order: { gte: order } },
          data: { order: { increment: 1 } },
        });
      }
      return tx.session.create({
        data: {
          weekId,
          name: dto.name,
          dayOfWeek: dto.dayOfWeek,
          order,
        },
      });
    });

    return toPublicSession(created);
  }

  async update(
    coachId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<PublicSession> {
    const session = await this.findOwnedSessionOrThrow(coachId, sessionId);

    if (dto.order !== undefined && dto.order !== session.order) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.shiftOrder(tx, session.weekId, session.order, dto.order!);
        const data: Prisma.SessionUpdateInput = { order: dto.order };
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.dayOfWeek !== undefined) data.dayOfWeek = dto.dayOfWeek;
        return tx.session.update({ where: { id: sessionId }, data });
      });
      return toPublicSession(updated);
    }

    const data: Prisma.SessionUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.dayOfWeek !== undefined) data.dayOfWeek = dto.dayOfWeek;

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data,
    });
    return toPublicSession(updated);
  }

  private async shiftOrder(
    tx: Prisma.TransactionClient,
    weekId: string,
    oldOrder: number,
    newOrder: number,
  ): Promise<void> {
    if (newOrder > oldOrder) {
      await tx.session.updateMany({
        where: { weekId, order: { gt: oldOrder, lte: newOrder } },
        data: { order: { decrement: 1 } },
      });
    } else {
      await tx.session.updateMany({
        where: { weekId, order: { gte: newOrder, lt: oldOrder } },
        data: { order: { increment: 1 } },
      });
    }
  }
}
