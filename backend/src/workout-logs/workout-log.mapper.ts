import {
  Block,
  Exercise,
  Program,
  Session,
  SessionExercise,
  SetLog,
  Week,
  WorkoutCompletionStatus,
  WorkoutLog,
} from '@prisma/client';
import { EmbeddedExercise } from '../session-exercises/session-exercise.mapper';

// Resumen del ejercicio prescrito embebido en cada SetLog, para que el
// frontend pueda mostrar "prescrito vs. realizado" en la misma fila sin una
// consulta adicional (RF-21/RF-22, docs/requirements.md) — mismo criterio
// que EmbeddedExercise en session-exercise.mapper.ts.
export interface EmbeddedSessionExercise {
  id: string;
  order: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetRpe: number | null;
  targetRir: number | null;
  exercise: EmbeddedExercise;
}

export interface PublicSetLog {
  id: string;
  workoutLogId: string;
  sessionExerciseId: string;
  setNumber: number;
  actualReps: number | null;
  actualLoad: number | null;
  actualRpe: number | null;
  actualRir: number | null;
  comments: string | null;
  createdAt: Date;
  updatedAt: Date;
  sessionExercise?: EmbeddedSessionExercise;
}

type SetLogWithExercise = SetLog & {
  sessionExercise?: SessionExercise & { exercise: Exercise };
};

export function toPublicSetLog(setLog: SetLogWithExercise): PublicSetLog {
  return {
    id: setLog.id,
    workoutLogId: setLog.workoutLogId,
    sessionExerciseId: setLog.sessionExerciseId,
    setNumber: setLog.setNumber,
    actualReps: setLog.actualReps,
    // Decimal -> number, mismo criterio que targetRpe en
    // session-exercise.mapper.ts: el frontend recibe JSON simple.
    actualLoad: setLog.actualLoad !== null ? Number(setLog.actualLoad) : null,
    actualRpe: setLog.actualRpe !== null ? Number(setLog.actualRpe) : null,
    actualRir: setLog.actualRir,
    comments: setLog.comments,
    createdAt: setLog.createdAt,
    updatedAt: setLog.updatedAt,
    ...(setLog.sessionExercise
      ? {
          sessionExercise: {
            id: setLog.sessionExercise.id,
            order: setLog.sessionExercise.order,
            targetSets: setLog.sessionExercise.targetSets,
            targetRepsMin: setLog.sessionExercise.targetRepsMin,
            targetRepsMax: setLog.sessionExercise.targetRepsMax,
            targetRpe:
              setLog.sessionExercise.targetRpe !== null
                ? Number(setLog.sessionExercise.targetRpe)
                : null,
            targetRir: setLog.sessionExercise.targetRir,
            exercise: {
              id: setLog.sessionExercise.exercise.id,
              name: setLog.sessionExercise.exercise.name,
              muscleGroup: setLog.sessionExercise.exercise.muscleGroup,
              isActive: setLog.sessionExercise.exercise.isActive,
            },
          },
        }
      : {}),
  };
}

// Contexto de prescripción embebido en un WorkoutLog (PROMPT 11, RF-25):
// nombre de la sesión + semana/bloque/programa que la originaron. Es
// SOLO LECTURA de la cadena de prescripción vigente al momento de la
// consulta -- exactamente la misma decisión ya documentada en PROMPT 10
// ("la prescripción mostrada corresponde a la vigente al momento de la
// consulta, no una copia congelada"), que PROMPT 11 pide mantener sin
// introducir versionado. Se agrega para que el historial y el detalle de
// un entrenamiento puedan mostrar "qué programa/sesión fue" sin que el
// frontend tenga que resolverlo con una consulta aparte.
export interface EmbeddedSessionContext {
  id: string;
  name: string;
  week: {
    id: string;
    number: number;
    block: {
      id: string;
      name: string;
      program: {
        id: string;
        name: string;
      };
    };
  };
}

export interface PublicWorkoutLog {
  id: string;
  sessionId: string;
  studentId: string;
  performedAt: Date;
  completionStatus: WorkoutCompletionStatus;
  overallRpe: number | null;
  fatigue: number | null;
  comments: string | null;
  durationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  setLogs?: PublicSetLog[];
  session?: EmbeddedSessionContext;
  // Conteo de SetLog sin traer cada fila -- usado en el LISTADO de
  // historial (GET /workout-logs), donde traer todas las series de cada
  // entrenamiento sería el volumen innecesario que PROMPT 11 pide evitar
  // ("evita traer grandes volúmenes innecesarios"). El detalle
  // (GET /workout-logs/:id) sigue embebiendo `setLogs` completo.
  setLogsCount?: number;
}

type SessionWithChain = Session & {
  week: Week & { block: Block & { program: Program } };
};

type WorkoutLogWithExtras = WorkoutLog & {
  setLogs?: SetLogWithExercise[];
  session?: SessionWithChain;
  _count?: { setLogs: number };
};

export function toPublicWorkoutLog(
  workoutLog: WorkoutLogWithExtras,
): PublicWorkoutLog {
  return {
    id: workoutLog.id,
    sessionId: workoutLog.sessionId,
    studentId: workoutLog.studentId,
    performedAt: workoutLog.performedAt,
    completionStatus: workoutLog.completionStatus,
    overallRpe:
      workoutLog.overallRpe !== null ? Number(workoutLog.overallRpe) : null,
    fatigue: workoutLog.fatigue,
    comments: workoutLog.comments,
    durationMinutes: workoutLog.durationMinutes,
    createdAt: workoutLog.createdAt,
    updatedAt: workoutLog.updatedAt,
    ...(workoutLog.setLogs
      ? { setLogs: workoutLog.setLogs.map(toPublicSetLog) }
      : {}),
    ...(workoutLog.session
      ? {
          session: {
            id: workoutLog.session.id,
            name: workoutLog.session.name,
            week: {
              id: workoutLog.session.week.id,
              number: workoutLog.session.week.number,
              block: {
                id: workoutLog.session.week.block.id,
                name: workoutLog.session.week.block.name,
                program: {
                  id: workoutLog.session.week.block.program.id,
                  name: workoutLog.session.week.block.program.name,
                },
              },
            },
          },
        }
      : {}),
    ...(workoutLog._count ? { setLogsCount: workoutLog._count.setLogs } : {}),
  };
}
