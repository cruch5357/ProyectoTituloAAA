import { Prisma, Role, WorkoutCompletionStatus } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { BlockAssignmentsService } from '../src/block-assignments/block-assignments.service';
import { plannedSets } from '../src/block-assignments/training-state';
import {
  assignmentWeekBounds,
  dateOnly,
  todayDate,
} from '../src/common/training/calendar-date';
import { capturePrescription } from '../src/common/training/workout-prescription';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Isolated, repeatable demo for flexible weekly training.
 *
 * - Creates its own coach and athlete; existing accounts are never touched.
 * - Every row has a deterministic id, so running it again only fills gaps.
 * - Nothing is deleted or updated outside the demo's own rows.
 * - `--qa` adds a fresh disposable athlete for API validation runs.
 *
 * Usage (backend/): DEMO_FLEX_CONFIRM=1 npm run demo:flexible [-- --qa]
 */
const VERSION = 'flexible-demo-v1';
const COACH_EMAIL = 'coach.flexible.demo@example.com';
const STUDENT_EMAIL = 'alumna.flexible.demo@example.com';
const CREDENTIALS_FILE = resolve(__dirname, '../../.env.demo-flexible');
const DAY_MS = 86_400_000;

const id = (key: string) =>
  'c' +
  createHash('sha256').update(`${VERSION}:${key}`).digest('hex').slice(0, 24);

// Deterministic noise so every fresh run produces the same history.
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
const roundLoad = (value: number) =>
  Math.max(2.5, Math.round(value / 2.5) * 2.5);

type ExerciseKey =
  | 'squat'
  | 'romanian'
  | 'hipThrust'
  | 'calf'
  | 'bench'
  | 'overhead'
  | 'triceps'
  | 'crunch'
  | 'row'
  | 'pulldown'
  | 'curl';

const EXERCISES: Record<
  ExerciseKey,
  { name: string; muscles: string[]; base: number; instructions: string }
> = {
  squat: {
    name: 'Sentadilla trasera',
    muscles: ['quadriceps', 'glutes'],
    base: 60,
    instructions:
      'Baja controlado hasta romper el paralelo y sube manteniendo el tronco firme.',
  },
  romanian: {
    name: 'Peso muerto rumano',
    muscles: ['hamstrings', 'glutes'],
    base: 55,
    instructions:
      'Lleva la cadera atrás con rodillas semiflexionadas y la barra cerca de las piernas.',
  },
  hipThrust: {
    name: 'Hip thrust con barra',
    muscles: ['glutes'],
    base: 70,
    instructions:
      'Apoya la espalda en el banco y extiende la cadera sin arquear la zona lumbar.',
  },
  calf: {
    name: 'Elevación de talones de pie',
    muscles: ['calves'],
    base: 40,
    instructions: 'Sube en puntillas con pausa arriba y baja lento.',
  },
  bench: {
    name: 'Press banca',
    muscles: ['chest', 'triceps'],
    base: 45,
    instructions:
      'Escápulas juntas, baja la barra al pecho y empuja en línea recta.',
  },
  overhead: {
    name: 'Press militar con mancuernas',
    muscles: ['shoulders'],
    base: 14,
    instructions:
      'Empuja sobre la cabeza sin arquear la espalda; carga por mancuerna.',
  },
  triceps: {
    name: 'Extensión de tríceps en polea',
    muscles: ['triceps'],
    base: 15,
    instructions: 'Codos fijos junto al cuerpo; extiende por completo.',
  },
  crunch: {
    name: 'Crunch en polea alta',
    muscles: ['abs'],
    base: 20,
    instructions: 'Flexiona el tronco llevando los codos hacia las rodillas.',
  },
  row: {
    name: 'Remo con barra',
    muscles: ['back', 'biceps'],
    base: 45,
    instructions: 'Tronco inclinado y estable; lleva la barra al abdomen.',
  },
  pulldown: {
    name: 'Jalón al pecho',
    muscles: ['back'],
    base: 40,
    instructions: 'Lleva la barra a la parte alta del pecho sin balancearte.',
  },
  curl: {
    name: 'Curl de bíceps con mancuernas',
    muscles: ['biceps'],
    base: 9,
    instructions: 'Sin balanceo; supina al subir. Carga por mancuerna.',
  },
};

const SESSIONS: { name: string; exercises: ExerciseKey[] }[] = [
  {
    name: 'Tren inferior',
    exercises: ['squat', 'romanian', 'hipThrust', 'calf'],
  },
  {
    name: 'Empuje y core',
    exercises: ['bench', 'overhead', 'triceps', 'crunch'],
  },
  { name: 'Tirón y brazos', exercises: ['row', 'pulldown', 'curl', 'crunch'] },
];

const BLOCKS = {
  base: {
    name: 'Base de fuerza · 4 semanas',
    weeks: 4,
    reps: 10,
    rpe: 7,
    rpeStep: 0,
    factor: 1,
  },
  flexible: {
    name: 'Progresión flexible · 4 semanas',
    weeks: 4,
    reps: 8,
    rpe: 7.5,
    rpeStep: 0.5,
    factor: 1.1,
  },
  highFrequency: {
    name: 'Alta frecuencia · 1 semana (5 sesiones)',
    weeks: 1,
    reps: 8,
    rpe: 7,
    rpeStep: 0,
    factor: 0.9,
  },
} as const;
type BlockKey = keyof typeof BLOCKS;

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DEMO_FLEX_CONFIRM !== '1' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error(
      'Solo demo local: requiere DEMO_FLEX_CONFIRM=1 y PostgreSQL local.',
    );
}

/** Reuses the stored demo password; generates one only on the first run. */
function demoPassword() {
  if (process.env.DEMO_FLEX_PASSWORD) return process.env.DEMO_FLEX_PASSWORD;
  if (existsSync(CREDENTIALS_FILE)) {
    const stored = readFileSync(CREDENTIALS_FILE, 'utf8').match(
      /^DEMO_FLEX_PASSWORD=(.+)$/m,
    );
    if (stored) return stored[1].trim();
  }
  const generated = `Demo${randomBytes(6).toString('hex')}9`;
  writeFileSync(
    CREDENTIALS_FILE,
    [
      '# Credenciales locales de la demo de planificación flexible (no versionar).',
      `DEMO_FLEX_COACH_EMAIL=${COACH_EMAIL}`,
      `DEMO_FLEX_STUDENT_EMAIL=${STUDENT_EMAIL}`,
      `DEMO_FLEX_PASSWORD=${generated}`,
      '',
    ].join('\n'),
  );
  return generated;
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
  throw new Error(
    `No se pudo ubicar la fecha ${date} en la zona horaria de la aplicación.`,
  );
}

async function ensureUser(
  db: PrismaService,
  key: string,
  data: { email: string; name: string; role: Role; coachId?: string },
  passwordHash: string,
) {
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing && existing.id !== id(key))
    throw new Error(
      `${data.email} ya existe y no pertenece a esta demo; no se modificó.`,
    );
  if (existing) return existing;
  return db.user.create({
    data: { id: id(key), passwordHash, isActive: true, ...data },
  });
}

async function ensureLibraryBlock(
  db: PrismaService,
  coachId: string,
  key: BlockKey,
  sessions: { name: string; exercises: ExerciseKey[] }[],
) {
  const blockId = id(`block-${key}`);
  const existing = await db.block.findUnique({ where: { id: blockId } });
  if (existing) return existing;
  const spec = BLOCKS[key];
  return db.block.create({
    data: {
      id: blockId,
      coachId,
      name: spec.name,
      order: 1,
      weeks: {
        create: Array.from({ length: spec.weeks }, (_, week) => ({
          number: week + 1,
          order: week + 1,
          sessions: {
            create: sessions.map((session, sessionIndex) => ({
              name: session.name,
              order: sessionIndex + 1,
              dayOfWeek: null,
              sessionExercises: {
                create: session.exercises.map((exercise, order) => {
                  const load = roundLoad(
                    EXERCISES[exercise].base * spec.factor * (1 + week * 0.025),
                  );
                  const rpe = Math.min(9, spec.rpe + week * spec.rpeStep);
                  return {
                    exerciseId: id(`exercise-${exercise}`),
                    order: order + 1,
                    targetSets: 3,
                    targetRepsMin: spec.reps,
                    targetRepsMax: spec.reps,
                    targetRpe: new Prisma.Decimal(rpe),
                    restSeconds: order < 2 ? 120 : 75,
                    notes:
                      'Ajusta la carga si la técnica se rompe o el RPE supera el objetivo.',
                    modifiers: [],
                    programmedSets: {
                      create: Array.from({ length: 3 }, (_, set) => ({
                        order: set + 1,
                        weight: new Prisma.Decimal(load),
                        reps: spec.reps,
                        rpe: new Prisma.Decimal(rpe),
                        priority:
                          order < 2 ? ('high' as const) : ('medium' as const),
                      })),
                    },
                  };
                }),
              },
            })),
          },
        })),
      },
    },
  });
}

/** Assigns through the real service so snapshots match production behavior. */
async function ensureAssignment(
  db: PrismaService,
  coachId: string,
  studentId: string,
  block: BlockKey,
  startDate: string,
) {
  const existing = await db.programAssignment.findFirst({
    where: { studentId, sourceBlockId: id(`block-${block}`) },
    orderBy: { assignedAt: 'desc' },
  });
  if (existing) return existing.id;
  const created = await new BlockAssignmentsService(db).assign(
    coachId,
    studentId,
    {
      blockId: id(`block-${block}`),
      startDate,
      replaceActive: true,
    },
  );
  return created.id;
}

type PlannedWorkout = {
  week: number;
  session: number;
  date: string;
  outcome: 'COMPLETED' | 'PARTIAL' | 'CLOSED_OMISSION';
};

async function recordHistory(
  db: PrismaService,
  studentId: string,
  assignmentId: string,
  workouts: PlannedWorkout[],
  today: string,
) {
  const assignment = await db.programAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      program: {
        include: {
          blocks: {
            include: {
              weeks: {
                orderBy: { order: 'asc' },
                include: {
                  sessions: {
                    orderBy: { order: 'asc' },
                    include: {
                      sessionExercises: {
                        orderBy: { order: 'asc' },
                        include: {
                          exercise: true,
                          programmedSets: { orderBy: { order: 'asc' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const weeks = assignment.program.blocks[0].weeks;
  const created: string[] = [];
  for (const workout of workouts) {
    if (workout.date >= today) continue; // today stays free for live use
    const session = weeks[workout.week].sessions[workout.session];
    const logId = id(`log-${assignmentId}-${workout.week}-${workout.session}`);
    const existing = await db.workoutLog.findUnique({ where: { id: logId } });
    const random = seededRandom(logId);
    // Separate stream: rest times vary without changing loads or reps.
    const rest = seededRandom(`${logId}:rest`);
    const startedAt = localDateTime(workout.date, Math.floor(random() * 50));
    const recordedExercises =
      workout.outcome === 'COMPLETED'
        ? session.sessionExercises.length
        : workout.outcome === 'PARTIAL'
          ? 2
          : 0;
    const setLogs: Prisma.SetLogCreateManyWorkoutLogInput[] = [];
    const omittedSets: { sessionExerciseId: string; setNumber: number }[] = [];
    let minute = 0;
    session.sessionExercises.forEach((exercise, exerciseIndex) => {
      for (const set of plannedSets(exercise)) {
        if (exerciseIndex >= recordedExercises) {
          omittedSets.push({
            sessionExerciseId: exercise.id,
            setNumber: set.setNumber,
          });
          continue;
        }
        // Heavy lifts rest 2.5-4.5 min, accessories 1.5-3 min.
        minute += exerciseIndex < 2 ? 2.5 + rest() * 2 : 1.5 + rest() * 1.5;
        const weight = Number(set.weight ?? 0);
        const reps = set.reps ?? exercise.targetRepsMin ?? 8;
        const lastSet = set.setNumber === plannedSets(exercise).length;
        const roll = random();
        setLogs.push({
          sessionExerciseId: exercise.id,
          setNumber: set.setNumber,
          // Mostly on target; an occasional extra 2.5 kg or a missed final rep.
          actualLoad: new Prisma.Decimal(roll > 0.85 ? weight + 2.5 : weight),
          actualReps: lastSet && roll < 0.25 ? reps - 1 : reps,
          actualRpe: new Prisma.Decimal(
            Math.min(
              10,
              Math.round(
                (Number(set.rpe ?? 7) +
                  (lastSet ? 0.5 : 0) +
                  (roll - 0.5) * 0.6) *
                  2,
              ) / 2,
            ),
          ),
          createdAt: new Date(startedAt.getTime() + minute * 60_000),
          updatedAt: new Date(startedAt.getTime() + minute * 60_000),
        });
      }
    });
    const closedOmission = workout.outcome === 'CLOSED_OMISSION';
    const finishedAt = closedOmission
      ? startedAt
      : new Date(startedAt.getTime() + (minute + 4) * 60_000);
    // Same rule as the live flow: first to last annotation.
    const durationMinutes =
      setLogs.length >= 2
        ? Math.round(
            ((setLogs.at(-1)!.createdAt as Date).getTime() -
              (setLogs[0].createdAt as Date).getTime()) /
              60_000,
          )
        : null;
    if (existing) {
      // Rows from an earlier version of this script: align only their timing.
      if (existing.durationMinutes !== durationMinutes) {
        for (const set of setLogs)
          await db.setLog.updateMany({
            where: {
              workoutLogId: logId,
              sessionExerciseId: set.sessionExerciseId,
              setNumber: set.setNumber,
            },
            data: { createdAt: set.createdAt, updatedAt: set.updatedAt },
          });
        await db.workoutLog.update({
          where: { id: logId },
          data: { durationMinutes, finishedAt },
        });
        await db.notification.updateMany({
          where: { dedupeKey: `workout:${logId}` },
          data: { createdAt: finishedAt },
        });
        await db.notification.updateMany({
          where: { dedupeKey: `workout:${logId}`, readAt: { not: null } },
          data: { readAt: finishedAt },
        });
      }
      continue;
    }
    await db.workoutLog.create({
      data: {
        id: logId,
        studentId,
        sessionId: session.id,
        programAssignmentId: assignmentId,
        structuredExecution: true,
        performedAt: startedAt,
        finishedAt,
        durationMinutes,
        revision: 2,
        completionStatus: (closedOmission
          ? 'SKIPPED'
          : workout.outcome) as WorkoutCompletionStatus,
        omittedSets,
        prescriptionCapturedAt: startedAt,
        createdAt: startedAt,
        prescriptions: {
          create: session.sessionExercises.map(capturePrescription),
        },
        setLogs: { createMany: { data: setLogs } },
      },
    });
    created.push(logId);
  }
  return created;
}

async function ensureWeekPlan(
  db: PrismaService,
  assignmentId: string,
  studentId: string,
  weekIndex: number,
  trainingDates: string[],
) {
  return db.trainingWeekPlan.upsert({
    where: {
      programAssignmentId_weekIndex: {
        programAssignmentId: assignmentId,
        weekIndex,
      },
    },
    create: {
      id: id(`plan-${assignmentId}-${weekIndex}`),
      programAssignmentId: assignmentId,
      studentId,
      weekIndex,
      trainingDates,
    },
    update: {},
  });
}

/** Coach notices for the seeded history, as the live flow would have created. */
async function notifyCoach(
  db: PrismaService,
  coachId: string,
  studentId: string,
  studentName: string,
) {
  const logs = await db.workoutLog.findMany({
    where: {
      studentId,
      completionStatus: { not: 'SKIPPED' },
      finishedAt: { not: null },
    },
    include: { session: { select: { name: true } } },
    orderBy: { performedAt: 'asc' },
  });
  for (const [index, log] of logs.entries()) {
    const title = `${studentName} finalizó un entrenamiento`;
    await db.notification.upsert({
      where: { dedupeKey: `workout:${log.id}` },
      create: {
        userId: coachId,
        type: 'WORKOUT_COMPLETED',
        title,
        body: `${title}: ${log.session.name}.`,
        resourceType: 'student',
        resourceId: studentId,
        dedupeKey: `workout:${log.id}`,
        createdAt: log.finishedAt!,
        // Only the latest two remain unread, as an attentive coach would leave them.
        readAt: index < logs.length - 2 ? log.finishedAt : null,
      },
      update: {},
    });
  }
}

async function main() {
  assertLocalDatabase();
  const qaRun = process.argv.includes('--qa');
  const db = new PrismaService();
  try {
    const before = await Promise.all([
      db.user.count(),
      db.workoutLog.count(),
      db.setLog.count(),
    ]);
    const password = demoPassword();
    const passwordHash = await hash(password, { type: argon2id });
    const today = todayDate();
    // The anchor fixes the dates so a run can be reproduced exactly.
    const anchor = process.env.DEMO_FLEX_ANCHOR ?? today;
    const monday = assignmentWeekBounds(dateOnly(anchor), 0)!.weekStart;

    const coach = await ensureUser(
      db,
      'coach',
      { email: COACH_EMAIL, name: 'Coach Demo Flexible', role: Role.COACH },
      passwordHash,
    );
    for (const [key, exercise] of Object.entries(EXERCISES)) {
      await db.exercise.upsert({
        where: { id: id(`exercise-${key}`) },
        create: {
          id: id(`exercise-${key}`),
          coachId: coach.id,
          name: exercise.name,
          muscleGroups: exercise.muscles,
          sports: ['general'],
          instructions: exercise.instructions,
        },
        update: {},
      });
    }
    await ensureLibraryBlock(db, coach.id, 'base', SESSIONS);
    await ensureLibraryBlock(db, coach.id, 'flexible', SESSIONS);
    await ensureLibraryBlock(db, coach.id, 'highFrequency', [
      ...SESSIONS,
      { name: 'Pierna accesoria', exercises: ['hipThrust', 'calf', 'crunch'] },
      { name: 'Torso accesorio', exercises: ['pulldown', 'triceps', 'curl'] },
    ]);

    if (qaRun) {
      // Fresh disposable athlete: last week has a pending session, this week is untouched.
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      const email = `alumno.flexible.qa.${stamp}@example.com`;
      const qa = await ensureUser(
        db,
        `qa-${stamp}`,
        {
          email,
          name: `QA Flexible ${stamp.slice(8, 12)}`,
          role: Role.STUDENT,
          coachId: coach.id,
        },
        passwordHash,
      );
      const assignmentId = await ensureAssignment(
        db,
        coach.id,
        qa.id,
        'flexible',
        addDays(monday, -7),
      );
      await recordHistory(
        db,
        qa.id,
        assignmentId,
        [
          {
            week: 0,
            session: 0,
            date: addDays(monday, -7),
            outcome: 'COMPLETED',
          },
          {
            week: 0,
            session: 1,
            date: addDays(monday, -5),
            outcome: 'COMPLETED',
          },
        ],
        today,
      );
      console.log(
        JSON.stringify({
          qa: { email, id: qa.id, assignmentId },
          coach: { email: COACH_EMAIL, id: coach.id },
          highFrequencyBlockId: id('block-highFrequency'),
          credentialsFile: CREDENTIALS_FILE,
        }),
      );
      return;
    }

    const student = await ensureUser(
      db,
      'student',
      {
        email: STUDENT_EMAIL,
        name: 'Alumna Demo Flexible',
        role: Role.STUDENT,
        coachId: coach.id,
      },
      passwordHash,
    );
    await db.userProfile.upsert({
      where: { userId: student.id },
      create: {
        id: id('student-profile'),
        userId: student.id,
        displayName: 'Alumna Demo',
        sport: 'general',
        city: 'Santiago',
        bio: 'Cuenta de demostración: entrena 3 veces por semana con días flexibles.',
      },
      update: {},
    });

    // Previous cycle (finished) and the active one, back to back.
    const baseStart = addDays(monday, -35);
    const flexibleStart = addDays(monday, -7);
    const baseAssignment = await ensureAssignment(
      db,
      coach.id,
      student.id,
      'base',
      baseStart,
    );
    const flexibleAssignment = await ensureAssignment(
      db,
      coach.id,
      student.id,
      'flexible',
      flexibleStart,
    );
    // The service stamps its notices "now"; place them when each cycle was assigned.
    for (const [assignmentId, start, read] of [
      [baseAssignment, baseStart, true],
      [flexibleAssignment, flexibleStart, false],
    ] as const) {
      const assignedAt = localDateTime(addDays(start, -1), 0);
      await db.notification.updateMany({
        where: {
          dedupeKey: `block-assigned:${assignmentId}`,
          userId: student.id,
        },
        // Never resets a notice the athlete already read.
        data: read
          ? { createdAt: assignedAt, readAt: assignedAt }
          : { createdAt: assignedAt },
      });
    }

    // Realistic weeks: varied days, one partial session and one closed omission.
    const baseDays = [
      [0, 2, 4],
      [1, 3, 5],
      [0, 2, 5],
      [1, 4, 6],
    ];
    const baseHistory: PlannedWorkout[] = baseDays.flatMap((days, week) =>
      days.map((day, session) => ({
        week,
        session,
        date: addDays(baseStart, week * 7 + day),
        outcome:
          week === 2 && session === 1
            ? ('PARTIAL' as const)
            : week === 2 && session === 2
              ? ('CLOSED_OMISSION' as const)
              : ('COMPLETED' as const),
      })),
    );
    // A closed omission is stored when it was closed: the next Monday.
    for (const workout of baseHistory)
      if (workout.outcome === 'CLOSED_OMISSION')
        workout.date = addDays(baseStart, workout.week * 7 + 7);
    const flexibleHistory: PlannedWorkout[] = [
      {
        week: 0,
        session: 0,
        date: addDays(flexibleStart, 0),
        outcome: 'COMPLETED',
      },
      {
        week: 0,
        session: 1,
        date: addDays(flexibleStart, 2),
        outcome: 'COMPLETED',
      },
      {
        week: 0,
        session: 2,
        date: addDays(flexibleStart, 5),
        outcome: 'COMPLETED',
      },
      // Current week: Monday is done when the anchor is later in the week.
      { week: 1, session: 0, date: monday, outcome: 'COMPLETED' },
    ];
    const createdLogs = [
      ...(await recordHistory(
        db,
        student.id,
        baseAssignment,
        baseHistory,
        today,
      )),
      ...(await recordHistory(
        db,
        student.id,
        flexibleAssignment,
        flexibleHistory,
        today,
      )),
    ];
    await ensureWeekPlan(db, flexibleAssignment, student.id, 0, [
      flexibleStart,
      addDays(flexibleStart, 2),
      addDays(flexibleStart, 5),
    ]);
    await ensureWeekPlan(db, flexibleAssignment, student.id, 1, [
      monday,
      addDays(monday, 2),
      addDays(monday, 4),
    ]);
    await notifyCoach(db, coach.id, student.id, student.name);
    const audit = await db.auditLog.findFirst({
      where: { action: 'DEMO_FLEXIBLE_SEEDED', entityId: student.id },
    });
    if (!audit)
      await db.auditLog.create({
        data: {
          actorId: coach.id,
          action: 'DEMO_FLEXIBLE_SEEDED',
          entityType: 'User',
          entityId: student.id,
          metadata: { version: VERSION, anchor },
        },
      });

    const after = await Promise.all([
      db.user.count(),
      db.workoutLog.count(),
      db.setLog.count(),
    ]);
    console.log(
      JSON.stringify(
        {
          coach: { email: COACH_EMAIL, id: coach.id },
          student: { email: STUDENT_EMAIL, id: student.id },
          credentialsFile: CREDENTIALS_FILE,
          anchorMonday: monday,
          assignments: { finished: baseAssignment, active: flexibleAssignment },
          createdWorkoutLogs: createdLogs.length,
          totals: {
            before: {
              users: before[0],
              workoutLogs: before[1],
              setLogs: before[2],
            },
            after: {
              users: after[0],
              workoutLogs: after[1],
              setLogs: after[2],
            },
          },
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
