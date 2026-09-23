import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Exercise, Prisma, SessionExercise } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  PublicSessionExercise,
  toPublicSessionExercise,
} from './session-exercise.mapper';
import { CreateSessionExerciseDto } from './dto/create-session-exercise.dto';
import { UpdateSessionExerciseDto } from './dto/update-session-exercise.dto';

const GENERIC_SESSION_EXERCISE_NOT_FOUND =
  'Ejercicio de la sesión no encontrado';
// Mismo mensaje genérico exacto que ExercisesService (PROMPT 07): un
// `exerciseId` que no existe o pertenece a otro coach responde igual que si
// se consultara ese ejercicio directamente por `GET /exercises/:id`.
const GENERIC_EXERCISE_NOT_FOUND = 'Ejercicio no encontrado';

type SessionExerciseWithChain = SessionExercise & {
  session: { week: { block: { program: { coachId: string } } } };
  exercise: Exercise;
};

// ---------------------------------------------------------------------------
// Integración Session <-> Exercise (PROMPT 08). Es la ÚNICA pieza de este
// prompt que autoriza sobre DOS cadenas de propiedad independientes al mismo
// tiempo:
//
// 1. La cadena de la Session (Session -> Week -> Block -> Program ->
//    coachId), igual que el resto de los recursos de programación.
// 2. La propiedad del Exercise referenciado (`Exercise.coachId`), para que
//    un coach jamás pueda prescribir en su propia sesión un ejercicio del
//    catálogo de OTRO coach, ni viceversa (agregar su propio ejercicio a la
//    sesión de otro coach — ya bloqueado por (1), pero se verifica (2) de
//    forma explícita e independiente por si alguna vez cambia el modelo a
//    ejercicios compartidos).
//
// Nunca se copian datos del Exercise hacia SessionExercise: solo se
// referencia `exerciseId` (relación ya existente en el schema, PROMPT 02).
// No se implementa ningún registro de ejecución real (WorkoutLog/SetLog),
// fuera de alcance de este prompt.
// ---------------------------------------------------------------------------
@Injectable()
export class SessionExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  private ensureOwnedSessionExercise(
    coachId: string,
    sessionExercise: SessionExerciseWithChain | null,
  ): SessionExerciseWithChain {
    if (
      !sessionExercise ||
      sessionExercise.session.week.block.program.coachId !== coachId
    ) {
      throw new NotFoundException(GENERIC_SESSION_EXERCISE_NOT_FOUND);
    }
    return sessionExercise;
  }

  async findOwnedSessionExerciseOrThrow(
    coachId: string,
    sessionExerciseId: string,
  ): Promise<SessionExerciseWithChain> {
    const sessionExercise = await this.prisma.sessionExercise.findUnique({
      where: { id: sessionExerciseId },
      include: {
        session: {
          include: {
            week: {
              include: {
                block: {
                  include: { program: { select: { coachId: true } } },
                },
              },
            },
          },
        },
        exercise: true,
      },
    });
    return this.ensureOwnedSessionExercise(
      coachId,
      sessionExercise as SessionExerciseWithChain | null,
    );
  }

  // Verifica que el ejercicio de catálogo referenciado exista y pertenezca
  // al mismo coach autenticado — nunca se confía en que el `exerciseId`
  // enviado por el cliente ya sea válido solo porque tiene forma de cuid.
  private async ensureOwnedExercise(
    coachId: string,
    exerciseId: string,
  ): Promise<Exercise> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
    });
    if (!exercise || exercise.coachId !== coachId) {
      throw new NotFoundException(GENERIC_EXERCISE_NOT_FOUND);
    }
    return exercise;
  }

  // Validación cruzada (422 "entidad válida en forma pero inválida en
  // reglas de negocio", docs/api.md sección 5): un rango fijo se expresa con
  // min = max; un rango real requiere max >= min.
  private ensureValidRepsRange(
    repsMin: number | null | undefined,
    repsMax: number | null | undefined,
  ): void {
    if (
      repsMin !== null &&
      repsMin !== undefined &&
      repsMax !== null &&
      repsMax !== undefined &&
      repsMax < repsMin
    ) {
      throw new UnprocessableEntityException(
        'targetRepsMax no puede ser menor que targetRepsMin',
      );
    }
  }

  async listForSession(
    coachId: string,
    sessionId: string,
  ): Promise<PublicSessionExercise[]> {
    await this.sessionsService.findOwnedSessionOrThrow(coachId, sessionId);

    const items = await this.prisma.sessionExercise.findMany({
      where: { sessionId },
      orderBy: { order: 'asc' },
      include: { exercise: true },
    });
    return items.map(toPublicSessionExercise);
  }

  async getOwnedByCoach(
    coachId: string,
    sessionExerciseId: string,
  ): Promise<PublicSessionExercise> {
    const item = await this.findOwnedSessionExerciseOrThrow(
      coachId,
      sessionExerciseId,
    );
    return toPublicSessionExercise(item);
  }

  // Misma estrategia atómica de "insertar y correr" que Block/Week/Session,
  // más las dos verificaciones de propiedad descritas en el comentario de
  // clase, ambas resueltas ANTES de abrir la transacción de escritura.
  async create(
    coachId: string,
    sessionId: string,
    dto: CreateSessionExerciseDto,
  ): Promise<PublicSessionExercise> {
    await this.sessionsService.findOwnedSessionOrThrow(coachId, sessionId);
    await this.ensureOwnedExercise(coachId, dto.exerciseId);
    this.ensureValidRepsRange(dto.targetRepsMin, dto.targetRepsMax);

    const created = await this.prisma.$transaction(async (tx) => {
      let order = dto.order;
      if (order === undefined) {
        const max = await tx.sessionExercise.aggregate({
          where: { sessionId },
          _max: { order: true },
        });
        order = (max._max.order ?? 0) + 1;
      } else {
        await tx.sessionExercise.updateMany({
          where: { sessionId, order: { gte: order } },
          data: { order: { increment: 1 } },
        });
      }
      return tx.sessionExercise.create({
        data: {
          sessionId,
          exerciseId: dto.exerciseId,
          order,
          targetSets: dto.targetSets,
          targetRepsMin: dto.targetRepsMin,
          targetRepsMax: dto.targetRepsMax,
          targetRpe: dto.targetRpe,
          targetRir: dto.targetRir,
          restSeconds: dto.restSeconds,
          notes: dto.notes,
        },
        include: { exercise: true },
      });
    });

    return toPublicSessionExercise(created);
  }

  async update(
    coachId: string,
    sessionExerciseId: string,
    dto: UpdateSessionExerciseDto,
  ): Promise<PublicSessionExercise> {
    const current = await this.findOwnedSessionExerciseOrThrow(
      coachId,
      sessionExerciseId,
    );

    if (dto.exerciseId !== undefined && dto.exerciseId !== current.exerciseId) {
      await this.ensureOwnedExercise(coachId, dto.exerciseId);
    }

    const effectiveRepsMin =
      dto.targetRepsMin !== undefined
        ? dto.targetRepsMin
        : current.targetRepsMin;
    const effectiveRepsMax =
      dto.targetRepsMax !== undefined
        ? dto.targetRepsMax
        : current.targetRepsMax;
    this.ensureValidRepsRange(effectiveRepsMin, effectiveRepsMax);

    const data: Prisma.SessionExerciseUpdateInput = {};
    if (dto.exerciseId !== undefined) {
      data.exercise = { connect: { id: dto.exerciseId } };
    }
    if (dto.targetSets !== undefined) data.targetSets = dto.targetSets;
    if (dto.targetRepsMin !== undefined) data.targetRepsMin = dto.targetRepsMin;
    if (dto.targetRepsMax !== undefined) data.targetRepsMax = dto.targetRepsMax;
    if (dto.targetRpe !== undefined) data.targetRpe = dto.targetRpe;
    if (dto.targetRir !== undefined) data.targetRir = dto.targetRir;
    if (dto.restSeconds !== undefined) data.restSeconds = dto.restSeconds;
    if (dto.notes !== undefined) data.notes = dto.notes;

    if (dto.order !== undefined && dto.order !== current.order) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.shiftOrder(tx, current.sessionId, current.order, dto.order!);
        return tx.sessionExercise.update({
          where: { id: sessionExerciseId },
          data: { ...data, order: dto.order },
          include: { exercise: true },
        });
      });
      return toPublicSessionExercise(updated);
    }

    const updated = await this.prisma.sessionExercise.update({
      where: { id: sessionExerciseId },
      data,
      include: { exercise: true },
    });
    return toPublicSessionExercise(updated);
  }

  private async shiftOrder(
    tx: Prisma.TransactionClient,
    sessionId: string,
    oldOrder: number,
    newOrder: number,
  ): Promise<void> {
    if (newOrder > oldOrder) {
      await tx.sessionExercise.updateMany({
        where: { sessionId, order: { gt: oldOrder, lte: newOrder } },
        data: { order: { decrement: 1 } },
      });
    } else {
      await tx.sessionExercise.updateMany({
        where: { sessionId, order: { gte: newOrder, lt: oldOrder } },
        data: { order: { increment: 1 } },
      });
    }
  }
}
