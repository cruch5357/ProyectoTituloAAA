import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Acierto real del modelo de carga sugerida en la plataforma.
 *
 * Compara cada predicción registrada (SuggestedLoadLog) con la primera
 * sesión del mismo ejercicio que el alumno hizo DESPUÉS de la sesión en que
 * se basó. Solo lee datos.
 *
 * Usage (backend/): npm run ml:evaluate
 */
const MIN_REPS = 1;
const MAX_REPS = 15;

const epley = (load: number, reps: number) =>
  reps === 1 ? load : load * (1 + reps / 30);
const round = (value: number, digits = 2) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;

type Outcome = {
  version: string;
  rule: string;
  predictedChange: number;
  actualChange: number;
  predictedE1rm: number;
  actualE1rm: number;
  inRange: boolean | null;
};

function summary(outcomes: Outcome[]) {
  const ranged = outcomes.filter((o) => o.inRange !== null);
  return {
    sesiones_evaluadas: outcomes.length,
    error_medio_cambio_pct: round(
      mean(outcomes.map((o) => Math.abs(o.predictedChange - o.actualChange))) *
        100,
    ),
    error_medio_e1rm_kg: round(
      mean(outcomes.map((o) => Math.abs(o.predictedE1rm - o.actualE1rm))),
    ),
    // Línea base: suponer que la fuerza no cambia respecto de la última sesión.
    error_repetir_ultima_pct: round(
      mean(outcomes.map((o) => Math.abs(o.actualChange))) * 100,
    ),
    acierto_direccion_pct: round(
      mean(
        outcomes.map((o) =>
          Math.sign(o.predictedChange) === Math.sign(o.actualChange) ? 1 : 0,
        ),
      ) * 100,
      1,
    ),
    dentro_del_rango_pct: ranged.length
      ? round(mean(ranged.map((o) => (o.inRange ? 1 : 0))) * 100, 1)
      : null,
  };
}

function groupBy(outcomes: Outcome[], key: (o: Outcome) => string) {
  const groups = new Map<string, Outcome[]>();
  for (const outcome of outcomes)
    groups.set(key(outcome), [...(groups.get(key(outcome)) ?? []), outcome]);
  return Object.fromEntries(
    [...groups.entries()].map(([name, items]) => [name, summary(items)]),
  );
}

async function main() {
  const db = new PrismaService();
  try {
    const logs = await db.suggestedLoadLog.findMany({
      orderBy: { createdAt: 'asc' },
    });
    const outcomes: Outcome[] = [];
    let pending = 0;
    for (const log of logs) {
      const nextDay = new Date(log.lastSessionDate.getTime() + 86_400_000);
      const sets = await db.setLog.findMany({
        where: {
          workoutLog: {
            studentId: log.studentId,
            performedAt: { gte: nextDay },
          },
          sessionExercise: { exerciseId: log.exerciseId },
          actualLoad: { gt: 0 },
          actualReps: { gte: MIN_REPS, lte: MAX_REPS },
        },
        select: {
          actualLoad: true,
          actualReps: true,
          workoutLog: { select: { performedAt: true } },
        },
        orderBy: { workoutLog: { performedAt: 'asc' } },
        take: 200,
      });
      if (!sets.length) {
        pending++;
        continue;
      }
      // Primera sesión posterior: mejor serie del día (mismo criterio del modelo).
      const day = sets[0].workoutLog.performedAt.toISOString().slice(0, 10);
      const actualE1rm = Math.max(
        ...sets
          .filter(
            (s) => s.workoutLog.performedAt.toISOString().slice(0, 10) === day,
          )
          .map((s) => epley(Number(s.actualLoad), s.actualReps!)),
      );
      const last = Number(log.lastE1rmKg);
      const predicted = Number(log.predictedE1rmKg);
      // El rango está en kg para las repeticiones objetivo: se compara con la
      // carga que corresponde a la fuerza real para esas repeticiones.
      const actualLoadAtTarget = actualE1rm / (1 + log.targetReps / 30);
      outcomes.push({
        version: log.modelVersion,
        rule: log.adjustments.length ? log.adjustments.join('+') : 'sin_regla',
        predictedChange: predicted / last - 1,
        actualChange: actualE1rm / last - 1,
        predictedE1rm: predicted,
        actualE1rm,
        inRange:
          log.rangeLowKg === null || log.rangeHighKg === null
            ? null
            : actualLoadAtTarget >= Number(log.rangeLowKg) - 1.25 &&
              actualLoadAtTarget <= Number(log.rangeHighKg) + 1.25,
      });
    }
    console.log(
      JSON.stringify(
        {
          predicciones_registradas: logs.length,
          pendientes_sin_sesion_posterior: pending,
          total: outcomes.length ? summary(outcomes) : null,
          por_version_del_modelo: groupBy(outcomes, (o) => o.version),
          por_regla_de_esfuerzo: groupBy(outcomes, (o) => o.rule),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error inesperado');
  process.exitCode = 1;
});
