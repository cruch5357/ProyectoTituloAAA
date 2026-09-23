import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PublicSetLog,
  toPublicSetLog,
} from '../workout-logs/workout-log.mapper';
import { UpdateSetLogDto } from './dto/update-set-log.dto';
import { ensureWithinEditWindow } from '../common/training/edit-window';

const GENERIC_SET_LOG_NOT_FOUND = 'Serie registrada no encontrada';

const SET_LOG_EXERCISE_INCLUDE = {
  sessionExercise: { include: { exercise: true } },
} satisfies Prisma.SetLogInclude;

// ---------------------------------------------------------------------------
// Edición de una serie ya registrada (PROMPT 10, RF-24). Vive en su propio
// módulo (en vez de dentro de WorkoutLogsService) porque su identificador de
// ruta es el propio `SetLog.id`, no el `WorkoutLog.id` — mismo criterio de
// "recurso propio vs. anidado" ya usado para separar
// ProgramAssignmentsController de ProgramAssignmentsNestedController.
//
// La propiedad se resuelve por `setLog.workoutLog.studentId` (el SetLog no
// tiene `studentId` propio: hereda la propiedad de su WorkoutLog — misma
// cadena de propiedad indirecta ya usada en Block/Week/Session/
// SessionExercise, solo que acá de un único nivel).
// ---------------------------------------------------------------------------
@Injectable()
export class SetLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async update(
    studentId: string,
    setLogId: string,
    dto: UpdateSetLogDto,
  ): Promise<PublicSetLog> {
    const setLog = await this.prisma.setLog.findUnique({
      where: { id: setLogId },
      include: {
        workoutLog: { select: { studentId: true, createdAt: true } },
        ...SET_LOG_EXERCISE_INCLUDE,
      },
    });

    if (!setLog || setLog.workoutLog.studentId !== studentId) {
      throw new NotFoundException(GENERIC_SET_LOG_NOT_FOUND);
    }
    ensureWithinEditWindow(setLog.workoutLog.createdAt);

    const data: Prisma.SetLogUpdateInput = {};
    if (dto.actualReps !== undefined) data.actualReps = dto.actualReps;
    if (dto.actualLoad !== undefined) data.actualLoad = dto.actualLoad;
    if (dto.actualRpe !== undefined) data.actualRpe = dto.actualRpe;
    if (dto.actualRir !== undefined) data.actualRir = dto.actualRir;
    if (dto.comments !== undefined) data.comments = dto.comments;

    const updated = await this.prisma.setLog.update({
      where: { id: setLogId },
      data,
      include: SET_LOG_EXERCISE_INCLUDE,
    });
    return toPublicSetLog(updated);
  }
}
