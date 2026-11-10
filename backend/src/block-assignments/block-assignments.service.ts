import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inactiveExerciseNames, libraryTree } from '../blocks/library-tree';
import { dateOnly } from '../common/training/calendar-date';
import { exerciseSnapshot } from './training-state';
import { AssignBlockDto } from './block-assignment.dto';

@Injectable()
export class BlockAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}
  async assign(coachId: string, studentId: string, dto: AssignBlockDto) {
    const startDate = dateOnly(dto.startDate);
    const dayOffsets = dto.dayOffsets;
    if (
      dayOffsets &&
      (new Set(dayOffsets).size !== dayOffsets.length ||
        dayOffsets.some((n, i) => i > 0 && n <= dayOffsets[i - 1]))
    ) {
      throw new BadRequestException(
        'Elige posiciones de día distintas y en orden creciente (1 a 7)',
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        // Same student lock as workout start and rescheduling: replacements cannot race them.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${studentId} FOR UPDATE`;
        const student = await tx.user.findFirst({
          where: { id: studentId, coachId, role: 'STUDENT', isActive: true },
        });
        if (!student)
          throw new NotFoundException('Alumno activo no encontrado');
        await tx.$queryRaw`SELECT id FROM blocks WHERE id = ${dto.blockId} FOR UPDATE`;
        const block = await tx.block.findFirst({
          where: { id: dto.blockId, coachId, programId: null },
          include: libraryTree,
        });
        if (!block) throw new NotFoundException('Bloque no encontrado');
        const inactive = inactiveExerciseNames(block);
        if (inactive.length)
          throw new BadRequestException(
            `El bloque está desactivado porque usa ejercicios desactivados (${inactive.join(', ')}). Reemplázalos por ejercicios activos o reactívalos para asignarlo.`,
          );
        if (!block.weeks.length)
          throw new BadRequestException('El bloque no tiene semanas');
        const maxDays = Math.max(...block.weeks.map((w) => w.sessions.length));
        if (!maxDays)
          throw new BadRequestException(
            'Añade al menos un día al bloque antes de asignarlo',
          );
        if (dayOffsets && dayOffsets.length !== maxDays)
          throw new BadRequestException(
            `Define las posiciones de los ${maxDays} días del bloque`,
          );
        const active = await tx.programAssignment.findMany({
          where: { studentId, status: 'ACTIVE' },
        });
        if (active.length && !dto.replaceActive)
          throw new ConflictException(
            'El alumno ya tiene un ciclo activo. Confirma su reemplazo; el historial se conservará.',
          );
        if (active.length)
          await tx.programAssignment.updateMany({
            where: { studentId, status: 'ACTIVE' },
            data: { status: 'FINISHED' },
          });
        // Private normalized copy: existing calendar/history/statistics can keep using the same relations.
        const program = await tx.program.create({
          data: {
            coachId,
            name: block.name,
            durationWeeks: block.weeks.length,
            isAssignmentSnapshot: true,
            blocks: {
              create: {
                name: block.name,
                order: 1,
                weeks: {
                  create: block.weeks.map((w, wi) => ({
                    number: wi + 1,
                    order: wi + 1,
                    sessions: {
                      create: w.sessions.map((d, di) => ({
                        name: d.name,
                        order: di + 1,
                        // New assignments need no fixed weekdays. Legacy
                        // callers may still keep optional suggestions.
                        dayOfWeek: dayOffsets
                          ? ((startDate.getUTCDay() + dayOffsets[di] - 2 + 7) %
                              7) +
                            1
                          : (d.dayOfWeek ?? null),
                        sessionExercises: {
                          create: d.sessionExercises.map((e, ei) => ({
                            exerciseId: e.exerciseId,
                            order: ei + 1,
                            targetSets: e.programmedSets.length,
                            notes: e.notes,
                            targetRepsMin: e.targetRepsMin,
                            targetRepsMax: e.targetRepsMax,
                            targetRpe: e.targetRpe,
                            targetRir: e.targetRir,
                            restSeconds: e.restSeconds,
                            modifiers: e.modifiers as Prisma.InputJsonValue,
                            frozenExercise: exerciseSnapshot(e.exercise),
                            programmedSets: {
                              create: e.programmedSets.map((s, si) => ({
                                order: si + 1,
                                weight: s.weight,
                                reps: s.reps,
                                rpe: s.rpe,
                                priority: s.priority,
                              })),
                            },
                          })),
                        },
                      })),
                    },
                  })),
                },
              },
            },
          },
          include: { blocks: true },
        });
        const assignment = await tx.programAssignment.create({
          data: {
            programId: program.id,
            studentId,
            startDate,
            sourceBlockId: block.id,
            snapshotBlockId: program.blocks[0].id,
            assignedByCoachId: coachId,
          },
        });
        if (maxDays >= 5) {
          await tx.notification.upsert({
            where: { dedupeKey: `assignment-load:${assignment.id}` },
            create: {
              userId: coachId,
              type: 'TRAINING_PLAN_WARNING',
              title: `Revisar carga de ${student.name}`,
              body: `El bloque asignado prescribe hasta ${maxDays} entrenamientos por semana. Revisa la recuperación y la distribución de la carga.`,
              resourceType: 'program-assignment',
              resourceId: assignment.id,
              dedupeKey: `assignment-load:${assignment.id}`,
            },
            update: { readAt: null },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId: coachId,
            action: 'BLOCK_ASSIGNED',
            entityType: 'BlockAssignment',
            entityId: assignment.id,
            metadata: {
              sourceBlockId: block.id,
              sourceRevision: block.revision,
              studentId,
              replacedAssignments: active.map((a) => a.id),
            },
          },
        });
        return {
          id: assignment.id,
          name: program.name,
          startDate,
          snapshotBlockId: assignment.snapshotBlockId,
        };
      },
      { timeout: 30000 },
    );
  }
}
