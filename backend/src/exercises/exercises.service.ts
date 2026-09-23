import { Injectable, NotFoundException } from '@nestjs/common';
import { Exercise, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITY_EXERCISE } from '../auth/auth.constants';
import { PublicExercise, toPublicExercise } from './exercise.mapper';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { UpdateExerciseStatusDto } from './dto/update-exercise-status.dto';
import { ListExercisesQueryDto } from './dto/list-exercises-query.dto';

export interface PaginatedExercises {
  items: PublicExercise[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const GENERIC_EXERCISE_NOT_FOUND = 'Ejercicio no encontrado';

// ---------------------------------------------------------------------------
// Catalogo de ejercicios del Coach (PROMPT 07). Sigue EXACTAMENTE el mismo
// patron de autorizacion por propiedad ya establecido en StudentsService
// (PROMPT 04, ver docs/security.md):
//
// - El `coachId` usado para filtrar/verificar SIEMPRE viene del usuario
//   autenticado (nunca de un parametro de ruta, query o body).
// - Cross-coach access (Coach A leyendo/editando un ejercicio de Coach B)
//   responde 404 ("Ejercicio no encontrado"), nunca 403 — mismo motivo que
//   Student: un 403 ya confirmaria que el id pertenece a un ejercicio
//   existente de otro coach (fuga de informacion, docs/api.md seccion 5).
// - No existe ningun metodo de borrado fisico: igual que Student, la unica
//   forma de "eliminar" un ejercicio es desactivarlo (isActive: false),
//   reversible. Esto satisface por diseño el requisito del prompt de nunca
//   poder romper el historial de una prescripcion que ya use el ejercicio
//   (la FK exercises<-session_exercises ya es RESTRICT, pero como nunca se
//   intenta un DELETE fisico, esa restriccion ni siquiera llega a evaluarse
//   desde esta capa).
// ---------------------------------------------------------------------------
@Injectable()
export class ExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Verifica que el ejercicio exista y pertenezca al coach autenticado.
  // Lanza 404 (nunca 403) en cualquier otro caso, sin distinguir "no existe"
  // de "existe pero es de otro coach" — mismo principio que
  // ensureOwnedStudent() en StudentsService.
  private ensureOwnedExercise(
    coachId: string,
    exercise: Exercise | null,
  ): Exercise {
    if (!exercise || exercise.coachId !== coachId) {
      throw new NotFoundException(GENERIC_EXERCISE_NOT_FOUND);
    }
    return exercise;
  }

  // -------------------------------------------------------------------
  // GET /exercises — unicamente los ejercicios del coach autenticado. El
  // scoping por coachId se aplica siempre en la clausula `where` de Prisma,
  // nunca en memoria despues de traer todos los ejercicios.
  // -------------------------------------------------------------------
  async listForCoach(
    coachId: string,
    query: ListExercisesQueryDto,
  ): Promise<PaginatedExercises> {
    const { page, limit, search } = query;

    const where: Prisma.ExerciseWhereInput = {
      coachId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              {
                muscleGroup: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      items: items.map(toPublicExercise),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // -------------------------------------------------------------------
  // GET /exercises/:id — detalle de un ejercicio propio.
  // -------------------------------------------------------------------
  async getOwnedByCoach(
    coachId: string,
    exerciseId: string,
  ): Promise<PublicExercise> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
    });
    return toPublicExercise(this.ensureOwnedExercise(coachId, exercise));
  }

  // -------------------------------------------------------------------
  // POST /exercises — crea un ejercicio propio del coach autenticado.
  // `isActive` nunca se recibe del cliente: toma el default `true` del
  // schema (mismo criterio que el registro de un Coach, que tampoco recibe
  // isActive del body).
  // -------------------------------------------------------------------
  async create(
    coachId: string,
    dto: CreateExerciseDto,
  ): Promise<PublicExercise> {
    const created = await this.prisma.exercise.create({
      data: {
        coachId,
        name: dto.name,
        muscleGroup: dto.muscleGroup,
        instructions: dto.instructions,
        videoUrl: dto.videoUrl,
      },
    });
    return toPublicExercise(created);
  }

  // -------------------------------------------------------------------
  // PATCH /exercises/:id — edicion de datos (nunca isActive, ver
  // UpdateExerciseDto). Mismo chequeo de propiedad que getOwnedByCoach()
  // antes de escribir nada. El objeto `data` se construye explicitamente
  // solo con los campos presentes en el DTO (prevencion de mass assignment
  // en profundidad, mismo criterio que StudentsService.updateStatus()):
  // aunque el DTO ya es angosto por diseño, nunca se reenvia el objeto
  // completo del body ni se hace spread directo sobre `data`.
  // -------------------------------------------------------------------
  async update(
    coachId: string,
    exerciseId: string,
    dto: UpdateExerciseDto,
  ): Promise<PublicExercise> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
    });
    this.ensureOwnedExercise(coachId, exercise);

    const data: Prisma.ExerciseUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.muscleGroup !== undefined) data.muscleGroup = dto.muscleGroup;
    if (dto.instructions !== undefined) data.instructions = dto.instructions;
    if (dto.videoUrl !== undefined) data.videoUrl = dto.videoUrl;

    const updated = await this.prisma.exercise.update({
      where: { id: exerciseId },
      data,
    });
    return toPublicExercise(updated);
  }

  // -------------------------------------------------------------------
  // PATCH /exercises/:id/status — unico campo mutable: `isActive`. Es la
  // ÚNICA forma de "eliminar" un ejercicio (baja logica, reversible) — no
  // existe ningun endpoint DELETE fisico (ver comentario de clase).
  // -------------------------------------------------------------------
  async updateStatus(
    coachId: string,
    exerciseId: string,
    dto: UpdateExerciseStatusDto,
  ): Promise<PublicExercise> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
    });
    this.ensureOwnedExercise(coachId, exercise);

    const updated = await this.prisma.exercise.update({
      where: { id: exerciseId },
      data: { isActive: dto.isActive },
    });

    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.EXERCISE_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_EXERCISE,
      entityId: updated.id,
      metadata: { isActive: dto.isActive },
    });

    return toPublicExercise(updated);
  }
}
