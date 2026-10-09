import { NotFoundException } from '@nestjs/common';
import { Prisma, Session, SessionExercise, Week } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Explicit allowlist: execution, snapshots and assignments never enter a copy.
function exerciseData(e: SessionExercise) {
  return {
    exerciseId: e.exerciseId,
    order: e.order,
    targetSets: e.targetSets,
    targetRepsMin: e.targetRepsMin,
    targetRepsMax: e.targetRepsMax,
    targetRpe: e.targetRpe,
    targetRir: e.targetRir,
    restSeconds: e.restSeconds,
    notes: e.notes,
  };
}
type PrescriptionSession = Session & { sessionExercises: SessionExercise[] };
function sessionData(s: PrescriptionSession) {
  return {
    name: s.name,
    order: s.order,
    dayOfWeek: s.dayOfWeek,
    sessionExercises: { create: s.sessionExercises.map(exerciseData) },
  };
}
function weekData(w: Week & { sessions: PrescriptionSession[] }) {
  return {
    number: w.number,
    order: w.order,
    sessions: { create: w.sessions.map(sessionData) },
  };
}
const sessions = {
  orderBy: { order: 'asc' as const },
  include: {
    sessionExercises: { orderBy: { order: 'asc' as const } },
  },
};

export async function duplicatePrescription(
  prisma: PrismaService,
  coachId: string,
  id: string,
  kind: 'program' | 'week' | 'session',
) {
  // Serialize copies from the same coach, including copy naming and sibling order.
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${coachId} FOR UPDATE`;
      let result: { id: string };
      if (kind === 'program') {
        const source = await tx.program.findFirst({
          where: { id, coachId },
          include: {
            blocks: {
              orderBy: { order: 'asc' },
              include: {
                weeks: { orderBy: { order: 'asc' }, include: { sessions } },
              },
            },
          },
        });
        if (!source) throw new NotFoundException('Programa no encontrado');
        const base = source.name
          .replace(/ \(copia(?: \d+)?\)$/, '')
          .slice(0, 140);
        const names = new Set(
          (
            await tx.program.findMany({
              where: { coachId, name: { startsWith: base } },
              select: { name: true },
            })
          ).map((p) => p.name),
        );
        let name = `${base} (copia)`;
        for (let n = 2; names.has(name); n++) name = `${base} (copia ${n})`;
        result = await tx.program.create({
          data: {
            coachId,
            name,
            description: source.description,
            durationWeeks: source.durationWeeks,
            blocks: {
              create: source.blocks.map((b) => ({
                name: b.name,
                order: b.order,
                weeks: { create: b.weeks.map(weekData) },
              })),
            },
          },
        });
      } else if (kind === 'week') {
        const source = await tx.week.findFirst({
          where: { id, block: { program: { coachId } } },
          include: { sessions },
        });
        if (!source) throw new NotFoundException('Semana no encontrada');
        // Descending individual updates also work with immediate UNIQUE constraints.
        const later = await tx.week.findMany({
          where: { blockId: source.blockId, order: { gt: source.order } },
          orderBy: { order: 'desc' },
        });
        for (const sibling of later)
          await tx.week.update({
            where: { id: sibling.id },
            data: { order: sibling.order + 1 },
          });
        result = await tx.week.create({
          data: {
            ...weekData(source),
            blockId: source.blockId,
            order: source.order + 1,
          },
        });
      } else {
        const source = await tx.session.findFirst({
          where: { id, week: { block: { program: { coachId } } } },
          include: { sessionExercises: { orderBy: { order: 'asc' } } },
        });
        if (!source) throw new NotFoundException('Sesión no encontrada');
        const later = await tx.session.findMany({
          where: { weekId: source.weekId, order: { gt: source.order } },
          orderBy: { order: 'desc' },
        });
        for (const sibling of later)
          await tx.session.update({
            where: { id: sibling.id },
            data: { order: sibling.order + 1 },
          });
        result = await tx.session.create({
          data: {
            ...sessionData(source),
            weekId: source.weekId,
            order: source.order + 1,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: coachId,
          action: `${kind.toUpperCase()}_DUPLICATED`,
          entityType: kind,
          entityId: result.id,
          metadata: { sourceId: id },
        },
      });
      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
