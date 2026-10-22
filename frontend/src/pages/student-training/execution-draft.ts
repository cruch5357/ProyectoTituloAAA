import type { TrainingDetail, TrainingSet } from "../../api/training";

export function updateSet(
  session: TrainingDetail,
  exerciseId: string,
  setNumber: number,
  changes: Partial<TrainingSet>,
): TrainingDetail {
  return {
    ...session,
    exercises: session.exercises.map((e) =>
      e.id !== exerciseId
        ? e
        : {
            ...e,
            sets: e.sets.map((s) =>
              s.setNumber === setNumber ? { ...s, ...changes } : s,
            ),
          },
    ),
  };
}

/** Null means empty; zero is an intentional value and must survive. */
export function fillEmptyActual(set: TrainingSet) {
  return {
    weight: set.actual.weight ?? set.weight,
    reps: set.actual.reps ?? set.reps,
    rpe: set.actual.rpe ?? set.rpe,
  };
}

export function firstPending(session: TrainingDetail): {
  exerciseId: string | null;
  setNumber: number | null;
} {
  for (const e of session.exercises) {
    const s = e.sets.find((s) => s.status === "PENDING");
    if (s) return { exerciseId: e.id, setNumber: s.setNumber };
  }
  return { exerciseId: null, setNumber: null };
}

/** Pending/omitted inputs are drafts, never definitive SetLogs. */
export function retainUnrecordedInputs(
  server: TrainingDetail,
  submitted: TrainingDetail,
): TrainingDetail {
  return {
    ...server,
    exercises: server.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => {
        const local = submitted.exercises
          .find((x) => x.id === e.id)
          ?.sets.find((x) => x.setNumber === s.setNumber);
        return local && s.status !== "RECORDED"
          ? { ...s, actual: local.actual }
          : s;
      }),
    })),
  };
}

export interface ExecutionDraft {
  revision: number;
  duration: string;
  exercises: {
    id: string;
    sets: Pick<TrainingSet, "setNumber" | "status" | "actual">[];
  }[];
}
export function serializeDraft(
  session: TrainingDetail,
  duration: string,
): ExecutionDraft {
  return {
    revision: session.revision,
    duration,
    exercises: session.exercises.map((e) => ({
      id: e.id,
      sets: e.sets.map(({ setNumber, status, actual }) => ({
        setNumber,
        status,
        actual,
      })),
    })),
  };
}

export function restoreDraft(
  server: TrainingDetail,
  saved: ExecutionDraft,
): TrainingDetail {
  // Identity, prescription, revision and permissions always come from the server.
  return {
    ...server,
    exercises: server.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => {
        const local = saved.exercises
          .find((x) => x.id === e.id)
          ?.sets.find((x) => x.setNumber === s.setNumber);
        if (
          !local ||
          !["PENDING", "RECORDED", "SKIPPED"].includes(local.status) ||
          !local.actual ||
          !["weight", "reps", "rpe"].every((k) => {
            const v = local.actual[k as keyof TrainingSet["actual"]];
            return (
              v === null ||
              (typeof v === "number" && Number.isFinite(v) && v >= 0)
            );
          })
        )
          return s;
        return { ...s, status: local.status, actual: local.actual };
      }),
    })),
  };
}
