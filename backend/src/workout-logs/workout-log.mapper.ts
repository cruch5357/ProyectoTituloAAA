import {
  Exercise,
  SessionExercise,
  SetLog,
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
}

type WorkoutLogWithSetLogs = WorkoutLog & { setLogs?: SetLogWithExercise[] };

export function toPublicWorkoutLog(
  workoutLog: WorkoutLogWithSetLogs,
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
  };
}
