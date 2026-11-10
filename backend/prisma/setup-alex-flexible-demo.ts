import { Prisma } from '@prisma/client';
import { BlockAssignmentsService } from '../src/block-assignments/block-assignments.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TARGET_EMAIL = 'alumno.presentacion@example.com';
const BLOCK_NAME = 'Progresión flexible · 4 semanas';
const START_DATE = '2026-11-10';
const INITIAL_PLAN = ['2026-11-10', '2026-11-12', '2026-11-14'];

type ExerciseKey =
  | 'squat'
  | 'romanianDeadlift'
  | 'hipThrust'
  | 'calfRaise'
  | 'benchPress'
  | 'militaryPress'
  | 'tricepsExtension'
  | 'crunch'
  | 'barbellRow'
  | 'bicepsCurl'
  | 'wristCurl';

const definitions: Record<
  ExerciseKey,
  { contains: string; fallback: number; reps: number }
> = {
  squat: { contains: 'Sentadilla', fallback: 80, reps: 8 },
  romanianDeadlift: { contains: 'Peso muerto rumano', fallback: 70, reps: 8 },
  hipThrust: { contains: 'Hip thrust', fallback: 90, reps: 10 },
  calfRaise: { contains: 'Elevación de talones', fallback: 35, reps: 12 },
  benchPress: { contains: 'Press banca', fallback: 60, reps: 8 },
  militaryPress: { contains: 'Press militar', fallback: 35, reps: 10 },
  tricepsExtension: {
    contains: 'Extensión de tríceps',
    fallback: 20,
    reps: 12,
  },
  crunch: { contains: 'Crunch en polea', fallback: 25, reps: 12 },
  barbellRow: { contains: 'Remo con barra', fallback: 55, reps: 8 },
  bicepsCurl: { contains: 'Curl de bíceps', fallback: 15, reps: 12 },
  wristCurl: { contains: 'Curl de muñeca', fallback: 12.5, reps: 15 },
};

const sessionTemplates: { name: string; exercises: ExerciseKey[] }[] = [
  {
    name: 'Tren inferior',
    exercises: ['squat', 'romanianDeadlift', 'hipThrust', 'calfRaise'],
  },
  {
    name: 'Empuje y core',
    exercises: ['benchPress', 'militaryPress', 'tricepsExtension', 'crunch'],
  },
  {
    name: 'Tirón y brazos',
    exercises: ['barbellRow', 'bicepsCurl', 'wristCurl', 'crunch'],
  },
];

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ALEX_DEMO_CONFIRM !== '1' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(
      'Solo demo local: requiere ALEX_DEMO_CONFIRM=1 y PostgreSQL local.',
    );
  }
}

function roundedLoad(value: number) {
  return Math.max(2.5, Math.round(value / 2.5) * 2.5);
}

async function main() {
  assertLocalDatabase();
  const db = new PrismaService();
  try {
    const student = await db.user.findUnique({
      where: { email: TARGET_EMAIL },
      select: { id: true, coachId: true, role: true, isActive: true },
    });
    if (
      !student ||
      student.role !== 'STUDENT' ||
      !student.isActive ||
      !student.coachId
    )
      throw new Error('No se encontró al alumno demo activo esperado.');

    const exercises = await db.exercise.findMany({
      where: { coachId: student.coachId, isActive: true },
      select: { id: true, name: true },
    });
    const resolved = {} as Record<ExerciseKey, (typeof exercises)[number]>;
    for (const [key, definition] of Object.entries(definitions) as [
      ExerciseKey,
      (typeof definitions)[ExerciseKey],
    ][]) {
      const exercise = exercises.find((item) =>
        item.name
          .toLocaleLowerCase('es-CL')
          .includes(definition.contains.toLocaleLowerCase('es-CL')),
      );
      if (!exercise)
        throw new Error(`Falta el ejercicio demo: ${definition.contains}`);
      resolved[key] = exercise;
    }

    const baseLoads = {} as Record<ExerciseKey, number>;
    for (const key of Object.keys(definitions) as ExerciseKey[]) {
      const lastHeavySet = await db.setLog.findFirst({
        where: {
          workoutLog: { studentId: student.id },
          sessionExercise: { exerciseId: resolved[key].id },
          actualLoad: { not: null },
        },
        select: { actualLoad: true },
        orderBy: { actualLoad: 'desc' },
      });
      baseLoads[key] = lastHeavySet?.actualLoad
        ? roundedLoad(Number(lastHeavySet.actualLoad) * 0.8)
        : definitions[key].fallback;
    }

    let block = await db.block.findFirst({
      where: {
        coachId: student.coachId,
        programId: null,
        name: BLOCK_NAME,
      },
      include: { weeks: { include: { sessions: true } } },
    });
    if (block) {
      const valid =
        block.weeks.length === 4 &&
        block.weeks.every((week) => week.sessions.length === 3);
      if (!valid)
        throw new Error(
          'El bloque demo ya existe pero no tiene la estructura 4x3 esperada; no se modificó.',
        );
    } else {
      block = await db.block.create({
        data: {
          coachId: student.coachId,
          name: BLOCK_NAME,
          order: 1,
          weeks: {
            create: Array.from({ length: 4 }, (_, weekIndex) => ({
              number: weekIndex + 1,
              order: weekIndex + 1,
              sessions: {
                create: sessionTemplates.map((session, sessionIndex) => ({
                  name: session.name,
                  order: sessionIndex + 1,
                  dayOfWeek: null,
                  sessionExercises: {
                    create: session.exercises.map((key, exerciseIndex) => {
                      const load = roundedLoad(
                        baseLoads[key] * (1 + weekIndex * 0.025),
                      );
                      const reps = definitions[key].reps;
                      const rpe = Math.min(8, 7 + weekIndex * 0.5);
                      return {
                        exerciseId: resolved[key].id,
                        order: exerciseIndex + 1,
                        targetSets: 3,
                        targetRepsMin: reps,
                        targetRepsMax: reps,
                        targetRpe: new Prisma.Decimal(rpe),
                        restSeconds: exerciseIndex < 2 ? 120 : 75,
                        notes:
                          'Carga inicial basada en el historial demo; ajustar si la técnica o el RPE lo requieren.',
                        modifiers: [],
                        programmedSets: {
                          create: Array.from({ length: 3 }, (_, setIndex) => ({
                            order: setIndex + 1,
                            weight: new Prisma.Decimal(load),
                            reps,
                            rpe: new Prisma.Decimal(rpe),
                            priority: exerciseIndex < 2 ? 'high' : 'medium',
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
        include: { weeks: { include: { sessions: true } } },
      });
    }

    let assignment = await db.programAssignment.findFirst({
      where: {
        studentId: student.id,
        status: 'ACTIVE',
        sourceBlockId: block.id,
      },
      select: { id: true },
    });
    if (!assignment) {
      const assignmentService = new BlockAssignmentsService(db);
      assignment = await assignmentService.assign(student.coachId, student.id, {
        blockId: block.id,
        startDate: START_DATE,
        replaceActive: true,
      });
    }

    const weekPlan = await db.trainingWeekPlan.upsert({
      where: {
        programAssignmentId_weekIndex: {
          programAssignmentId: assignment.id,
          weekIndex: 0,
        },
      },
      create: {
        programAssignmentId: assignment.id,
        studentId: student.id,
        weekIndex: 0,
        trainingDates: INITIAL_PLAN,
      },
      update: { trainingDates: INITIAL_PLAN },
      select: { revision: true },
    });
    await db.auditLog.create({
      data: {
        actorId: student.id,
        action: 'TRAINING_WEEK_PLAN_DEMO_INITIALIZED',
        entityType: 'ProgramAssignment',
        entityId: assignment.id,
        metadata: { weekIndex: 0, trainingDates: INITIAL_PLAN },
      },
    });

    const counts = await Promise.all([
      db.user.count(),
      db.workoutLog.count(),
      db.setLog.count(),
      db.programAssignment.count(),
    ]);
    console.log(
      JSON.stringify({
        blockId: block.id,
        assignmentId: assignment.id,
        weeks: 4,
        sessionsPerWeek: 3,
        initialPlan: INITIAL_PLAN,
        planRevision: weekPlan.revision,
        preservedCounts: {
          users: counts[0],
          workoutLogs: counts[1],
          setLogs: counts[2],
          assignments: counts[3],
        },
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
