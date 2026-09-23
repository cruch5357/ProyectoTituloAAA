import { Injectable, NotFoundException } from '@nestjs/common';
import { Program, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITY_PROGRAM } from '../auth/auth.constants';
import { PublicProgram, toPublicProgram } from './program.mapper';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { UpdateProgramStatusDto } from './dto/update-program-status.dto';
import { ListProgramsQueryDto } from './dto/list-programs-query.dto';

export interface PaginatedPrograms {
  items: PublicProgram[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const GENERIC_PROGRAM_NOT_FOUND = 'Programa no encontrado';

// ---------------------------------------------------------------------------
// Programas del Coach (PROMPT 08). Raiz de toda la jerarquia de prescripcion
// (Program -> Block -> Week -> Session -> SessionExercise). Sigue EXACTAMENTE
// el mismo patron de autorizacion por propiedad ya establecido en
// StudentsService (PROMPT 04) y ExercisesService (PROMPT 07):
//
// - El `coachId` usado para filtrar/verificar SIEMPRE viene del usuario
//   autenticado (nunca de un parametro de ruta, query o body).
// - Cross-coach access responde 404 ("Programa no encontrado"), nunca 403 —
//   mismo motivo ya documentado: un 403 confirmaria que el id pertenece a un
//   programa existente de otro coach.
// - `ensureOwnedProgram()` es el punto de entrada que BlocksService (y, a
//   traves de el, WeeksService/SessionsService/SessionExercisesService)
//   reutiliza para verificar el primer eslabon de la cadena de propiedad
//   antes de crear un Block bajo un Program dado.
// ---------------------------------------------------------------------------
@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Verifica que el programa exista y pertenezca al coach autenticado.
  // Lanza 404 (nunca 403) sin distinguir "no existe" de "es de otro coach".
  ensureOwnedProgram(coachId: string, program: Program | null): Program {
    if (!program || program.coachId !== coachId) {
      throw new NotFoundException(GENERIC_PROGRAM_NOT_FOUND);
    }
    return program;
  }

  // Variante que además consulta la base de datos por id — usada por otros
  // servicios (BlocksService.create) que solo tienen el id del programa
  // padre, no el objeto ya cargado.
  async findOwnedProgramOrThrow(
    coachId: string,
    programId: string,
  ): Promise<Program> {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
    });
    return this.ensureOwnedProgram(coachId, program);
  }

  async listForCoach(
    coachId: string,
    query: ListProgramsQueryDto,
  ): Promise<PaginatedPrograms> {
    const { page, limit, search } = query;

    const where: Prisma.ProgramWhereInput = {
      coachId,
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.program.count({ where }),
    ]);

    return {
      items: items.map(toPublicProgram),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getOwnedByCoach(
    coachId: string,
    programId: string,
  ): Promise<PublicProgram> {
    const program = await this.findOwnedProgramOrThrow(coachId, programId);
    return toPublicProgram(program);
  }

  async create(coachId: string, dto: CreateProgramDto): Promise<PublicProgram> {
    const created = await this.prisma.program.create({
      data: {
        coachId,
        name: dto.name,
        description: dto.description,
        durationWeeks: dto.durationWeeks,
      },
    });
    return toPublicProgram(created);
  }

  async update(
    coachId: string,
    programId: string,
    dto: UpdateProgramDto,
  ): Promise<PublicProgram> {
    await this.findOwnedProgramOrThrow(coachId, programId);

    const data: Prisma.ProgramUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.durationWeeks !== undefined) {
      data.durationWeeks = dto.durationWeeks;
    }

    const updated = await this.prisma.program.update({
      where: { id: programId },
      data,
    });
    return toPublicProgram(updated);
  }

  // Unica forma de "eliminar" un programa (baja logica, reversible) — no
  // existe DELETE /programs/:id, mismo criterio que Student/Exercise.
  async updateStatus(
    coachId: string,
    programId: string,
    dto: UpdateProgramStatusDto,
  ): Promise<PublicProgram> {
    await this.findOwnedProgramOrThrow(coachId, programId);

    const updated = await this.prisma.program.update({
      where: { id: programId },
      data: { isActive: dto.isActive },
    });

    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.PROGRAM_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_PROGRAM,
      entityId: updated.id,
      metadata: { isActive: dto.isActive },
    });

    return toPublicProgram(updated);
  }
}
