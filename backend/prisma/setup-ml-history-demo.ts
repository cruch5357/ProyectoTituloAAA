import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { exerciseSnapshot } from '../src/block-assignments/training-state';
import { dateOnly, todayDate } from '../src/common/training/calendar-date';
import { capturePrescription } from '../src/common/training/workout-prescription';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Bench-press-only history for alumno.modelo, so the suggested-load model
 * has a long, realistic series to work with.
 *
 * - Two closed cycles; the student's active cycle and existing logs are untouched.
 * - Deterministic ids: running it again only fills gaps.
 * - Beginner double progression: 3x8, +2.5 kg once all sets reach 8 reps.
 *
 * Usage (backend/): ML_DEMO_CONFIRM=1 npm run demo:ml-history
 */
const VERSION = 'ml-history-demo-v1';
const STUDENT_EMAIL = 'alumno.modelo@example.com';
const EXERCISE_NAME = 'Press banca';
const DAY_MS = 86_400_000;

const id = (key: string) =>
  'c' +
  createHash('sha256').update(`${VERSION}:${key}`).digest('hex').slice(0, 24);

function seededRandom(key: string) {
  let state = parseInt(
    createHash('sha256').update(key).digest('hex').slice(0, 8),
    16,
  );
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

const addDays = (date: string, days: number) =>
  new Date(dateOnly(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);

type Cycle = {
  key: string;
  name: string;
  start: string; // Monday
  end: string; // last day with a workout (inclusive)
  weekdays: number[]; // offsets from Monday
  startLoad: number;
};

// Continues the existing series: 40 kg on 21-09 and 47.5 kg on 06-10.
const CYCLES: Cycle[] = [
  {
    key: 'base',
    name: 'Press banca · base (historial ML)',
    start: '2026-07-06',
    end: '2026-09-18',
    weekdays: [0, 3],
    // Empty bar; reaches 37.5 kg just before the existing 40 kg on 21-09.
    startLoad: 20,
  },
  {
    key: 'progression',
    name: 'Press banca · progresión (historial ML)',
    start: '2026-10-12',
    end: '',
    weekdays: [0, 2, 4],
    startLoad: 47.5,
  },
];

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ML_DEMO_CONFIRM !== '1' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error(
      'Solo demo local: requiere ML_DEMO_CONFIRM=1 y PostgreSQL local.',
    );
}

/** Local evening time that stays on the same calendar date in the app timezone. */
function localDateTime(date: string, minutes: number) {
  for (const hour of [22, 15, 3]) {
    const value = new Date(
      `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    );
    value.setUTCMinutes(minutes);
    if (todayDate(value) === date) return value;
  }
  throw new Error(`No se pudo ubicar la fecha ${date}.`);
}

type PlannedSession = {
  date: string;
  load: number;
  reps: number[];
  rpe: number[];
};

/** Double progression with occasional bad days and one deload per cycle. */
function plan(
  cycle: Cycle,
  busyDates: Set<string>,
  lastDate: string,
): PlannedSession[] {
  const random = seededRandom(cycle.key);
  const dates: string[] = [];
  for (let week = 0; ; week++) {
    const monday = addDays(cycle.start, week * 7);
    if (monday > lastDate) break;
    for (const offset of cycle.weekdays) {
      const date = addDays(monday, offset);
      if (date <= lastDate && !busyDates.has(date)) dates.push(date);
    }
  }
  const deloadAt = Math.floor(dates.length * 0.55);
  let load = cycle.startLoad;
  let topReps = 7; // the last set of the first session is still hard
  return dates.map((date, index) => {
    const deload = index === deloadAt;
    const badDay = !deload && random() < 0.12;
    const sessionLoad = deload ? Math.round((load * 0.85) / 2.5) * 2.5 : load;
    const reps = deload
      ? [8, 8, 8]
      : [8, 8, Math.max(5, topReps - (badDay ? 2 : 0))].map((r, set) =>
          badDay && set === 1 ? r - 1 : r,
        );
    const rpe = reps.map((r, set) =>
      deload
        ? 6.5
        : Math.min(
            10,
            (r < 8 ? 9 : 8) +
              (set === 2 ? 0.5 : 0) -
              (random() < 0.3 ? 0.5 : 0),
          ),
    );
    if (!deload && !badDay) {
      if (reps.every((r) => r >= 8)) {
        load += 2.5;
        topReps = random() < 0.5 ? 6 : 7;
      } else topReps = Math.min(8, topReps + 1);
    }
    return { date, load: sessionLoad, reps, rpe };
  });
}

async function main() {
  assertLocalDatabase();
  const db = new PrismaService();
  try {
    const student = await db.user.findUnique({
      where: { email: STUDENT_EMAIL },
    });
    if (!student?.coachId || student.role !== 'STUDENT')
      throw new Error(`No se encontró al alumno ${STUDENT_EMAIL} con coach.`);
    const exercise = await db.exercise.findFirst({
      where: { coachId: student.coachId, name: EXERCISE_NAME, isActive: true },
    });
    if (!exercise)
      throw new Error(
        `El coach no tiene el ejercicio activo "${EXERCISE_NAME}".`,
      );

    // Days that already have a workout keep only their original record.
    const ownAssignments = CYCLES.map((cycle) => id(`assignment-${cycle.key}`));
    const existing = await db.workoutLog.findMany({
      where: {
        studentId: student.id,
        OR: [
          { programAssignmentId: null },
          { programAssignmentId: { notIn: ownAssignments } },
        ],
      },
      select: { performedAt: true },
    });
    const busy = new Set(existing.map((log) => todayDate(log.performedAt)));
    const yesterday = addDays(todayDate(), -1);
    let created = 0;

    for (const cycle of CYCLES) {
      const sessions = plan(cycle, busy, cycle.end || yesterday);
      const weeks = new Map<number, PlannedSession[]>();
      for (const session of sessions) {
        const week = Math.floor(
          (dateOnly(session.date).getTime() - dateOnly(cycle.start).getTime()) /
            (7 * DAY_MS),
        );
        weeks.set(week, [...(weeks.get(week) ?? []), session]);
      }
      const programId = id(`program-${cycle.key}`);
      if (!(await db.program.findUnique({ where: { id: programId } }))) {
        // Same shape as an assignment snapshot: one block, one exercise per session.
        await db.program.create({
          data: {
            id: programId,
            coachId: student.coachId,
            name: cycle.name,
            durationWeeks: weeks.size,
            isAssignmentSnapshot: true,
            blocks: {
              create: {
                id: id(`block-${cycle.key}`),
                name: cycle.name,
                order: 1,
                weeks: {
                  create: [...weeks.values()].map((items, weekOrder) => ({
                    number: weekOrder + 1,
                    order: weekOrder + 1,
                    sessions: {
                      create: items.map((item, order) => ({
                        id: id(`session-${cycle.key}-${item.date}`),
                        name: 'Press banca',
                        order: order + 1,
                        dayOfWeek: null,
                        sessionExercises: {
                          create: {
                            id: id(
                              `session-exercise-${cycle.key}-${item.date}`,
                            ),
                            exerciseId: exercise.id,
                            order: 1,
                            targetSets: 3,
                            targetRepsMin: 8,
                            targetRepsMax: 8,
                            targetRpe: new Prisma.Decimal(8),
                            restSeconds: 150,
                            notes:
                              'Doble progresión: sube 2,5 kg cuando completes 3x8.',
                            modifiers: [],
                            frozenExercise: exerciseSnapshot(
                              exercise,
                            ) as Prisma.InputJsonValue,
                            programmedSets: {
                              create: [1, 2, 3].map((order) => ({
                                order,
                                weight: new Prisma.Decimal(item.load),
                                reps: 8,
                                rpe: new Prisma.Decimal(8),
                                priority: 'high' as const,
                              })),
                            },
                          },
                        },
                      })),
                    },
                  })),
                },
              },
            },
          },
        });
        await db.programAssignment.create({
          data: {
            id: id(`assignment-${cycle.key}`),
            programId,
            studentId: student.id,
            status: 'FINISHED',
            startDate: dateOnly(cycle.start),
            snapshotBlockId: id(`block-${cycle.key}`),
            assignedByCoachId: student.coachId,
            assignedAt: localDateTime(addDays(cycle.start, -1), 0),
          },
        });
      }

      for (const item of sessions) {
        const logId = id(`log-${cycle.key}-${item.date}`);
        if (await db.workoutLog.findUnique({ where: { id: logId } })) continue;
        const sessionExercise = await db.sessionExercise.findUnique({
          where: { id: id(`session-exercise-${cycle.key}-${item.date}`) },
          include: { exercise: true },
        });
        if (!sessionExercise) continue; // session added after the program was created
        const random = seededRandom(logId);
        const startedAt = localDateTime(item.date, Math.floor(random() * 50));
        const setTimes = [6, 10 + random() * 2, 14 + random() * 3].map(
          (minute) => new Date(startedAt.getTime() + minute * 60_000),
        );
        await db.workoutLog.create({
          data: {
            id: logId,
            studentId: student.id,
            sessionId: sessionExercise.sessionId,
            programAssignmentId: id(`assignment-${cycle.key}`),
            structuredExecution: true,
            performedAt: startedAt,
            finishedAt: new Date(setTimes[2].getTime() + 3 * 60_000),
            durationMinutes: Math.round(
              (setTimes[2].getTime() - setTimes[0].getTime()) / 60_000,
            ),
            revision: 2,
            completionStatus: 'COMPLETED',
            omittedSets: [],
            prescriptionCapturedAt: startedAt,
            createdAt: startedAt,
            prescriptions: { create: capturePrescription(sessionExercise) },
            setLogs: {
              createMany: {
                data: item.reps.map((reps, index) => ({
                  sessionExerciseId: sessionExercise.id,
                  setNumber: index + 1,
                  actualLoad: new Prisma.Decimal(item.load),
                  actualReps: reps,
                  actualRpe: new Prisma.Decimal(item.rpe[index]),
                  createdAt: setTimes[index],
                  updatedAt: setTimes[index],
                })),
              },
            },
          },
        });
        created++;
      }
    }

    const series = await db.setLog.findMany({
      where: {
        workoutLog: { studentId: student.id },
        sessionExercise: { exerciseId: exercise.id },
      },
      select: {
        actualLoad: true,
        workoutLog: { select: { id: true, performedAt: true } },
      },
      orderBy: { workoutLog: { performedAt: 'asc' } },
    });
    const sessionsWithBench = new Set(series.map((set) => set.workoutLog.id))
      .size;
    console.log(
      JSON.stringify({
        student: STUDENT_EMAIL,
        exercise: { name: exercise.name, id: exercise.id },
        createdWorkoutLogs: created,
        benchSessionsTotal: sessionsWithBench,
        first: series[0]?.workoutLog.performedAt.toISOString().slice(0, 10),
        last: series.at(-1)?.workoutLog.performedAt.toISOString().slice(0, 10),
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error inesperado');
  process.exitCode = 1;
});
