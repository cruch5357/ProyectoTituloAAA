import { useState } from "react";
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";
import {
  trainingLabels,
  trainingPayload,
  useTrainingSession,
  type TrainingDetail,
  type TrainingSet,
} from "../../api/training";
import { ErrorState, Skeleton } from "../../components/ui/Primitives";
import { ExerciseVideo } from "../../components/ui/ExerciseVideo";
import { useAuth } from "../../auth/useAuth";
import "./training.css";

export function TrainingSessionPage() {
  const { id = "" } = useParams();
  const [search] = useSearchParams();
  const assignmentId = search.get("assignmentId") ?? "";
  const query = useTrainingSession(id, assignmentId);
  if (query.isLoading) return <Skeleton label="Cargando sesión…" />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  return query.data ? (
    <SessionRecorder
      key={`${id}:${assignmentId}`}
      initial={query.data}
      queryAssignmentId={assignmentId}
    />
  ) : null;
}
function SessionRecorder({
  initial,
  queryAssignmentId,
}: {
  initial: TrainingDetail;
  queryAssignmentId: string;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [duration, setDuration] = useState(
    initial.durationMinutes?.toString() ?? "",
  );
  const [confirm, setConfirm] = useState<"finish" | "skip" | null>(null);
  const cache = useQueryClient();
  const blocker = useBlocker(dirty);
  useBeforeUnload((e) => {
    if (dirty) e.preventDefault();
  });
  const mutation = useMutation({
    mutationFn: async ({
      finish,
      skip = false,
    }: {
      finish: boolean;
      skip?: boolean;
    }) => {
      const value = skip
        ? {
            ...draft,
            exercises: draft.exercises.map((e) => ({
              ...e,
              sets: e.sets.map((s) => ({ ...s, status: "SKIPPED" as const })),
            })),
          }
        : draft;
      return (
        await apiClient.patch<TrainingDetail>(
          `/training/sessions/${draft.id}`,
          trainingPayload(
            value,
            finish,
            duration ? Number(duration) : undefined,
          ),
        )
      ).data;
    },
    onSuccess: (data) => {
      setDraft(data);
      setDirty(false);
      setConfirm(null);
      cache.setQueryData(
        ["training-session", data.id, queryAssignmentId],
        data,
      );
      for (const key of ["training", "coaching", "workoutLogs", "dashboard"])
        void cache.invalidateQueries({ queryKey: [key] });
    },
  });
  const sets = draft.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.status === "RECORDED").length;
  const pending = sets.filter((s) => s.status === "PENDING").length;
  function update(
    exerciseId: string,
    setNumber: number,
    changes: Partial<TrainingSet>,
  ) {
    setDraft((v) => ({
      ...v,
      exercises: v.exercises.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.setNumber === setNumber ? { ...s, ...changes } : s,
              ),
            }
          : e,
      ),
    }));
    setDirty(true);
  }
  const disabled = initial.readOnly || mutation.isPending;
  return (
    <section className="training-recorder">
      <Link
        to={
          user?.role === "COACH"
            ? `/students/${initial.studentId}?tab=program`
            : "/training"
        }
      >
        ← Volver al entrenamiento
      </Link>
      <header className="training-session-header">
        <p className="eyebrow">
          {draft.blockName} · Semana {draft.weekNumber} · Día {draft.dayNumber}
        </p>
        <h1>{draft.name}</h1>
        <p>
          <span className={`training-status training-status--${draft.status}`}>
            {trainingLabels[draft.status]}
          </span>{" "}
          · {done} de {sets.length} series registradas
          {dirty && " · Cambios sin guardar"}
        </p>
        <progress max={sets.length || 1} value={done} />
      </header>
      {initial.readOnly && (
        <p className="training-notice">
          Consulta de entrenamiento. Este registro es de solo lectura.
          {initial.legacy && initial.workoutLogId && (
            <>
              {" "}
              <Link to={`/workout-logs/${initial.workoutLogId}`}>
                Ver registro histórico
              </Link>
            </>
          )}
        </p>
      )}
      {!initial.readOnly && (
        <p className="muted">
          Marca «Como prescrito» y ajusta lo que realmente hiciste. Solo puedes
          registrar las series programadas por tu coach.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ finish: false });
        }}
      >
        {draft.exercises.map((exercise, index) => (
          <article className="training-exercise" key={exercise.id}>
            <header>
              <span className="training-exercise-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{exercise.name}</h2>
                <p>
                  {exercise.sets.filter((s) => s.status === "RECORDED").length}/
                  {exercise.sets.length} series ·{" "}
                  {trainingLabels[exercise.status]}
                </p>
              </div>
            </header>
            {exercise.notes && <p>{exercise.notes}</p>}
            {exercise.instructions && (
              <details>
                <summary>Indicaciones</summary>
                <p>{exercise.instructions}</p>
              </details>
            )}
            {exercise.videoUrl && (
              <ExerciseVideo
                videoUrl={exercise.videoUrl}
                name={exercise.name}
              />
            )}
            {!exercise.sets.length && (
              <p className="muted">Sin series programadas.</p>
            )}
            {exercise.sets.map((s) => (
              <fieldset
                className={`performed-set performed-set--${s.status}`}
                key={s.setNumber}
                disabled={disabled}
                aria-label={`${exercise.name}, serie ${s.setNumber}`}
              >
                <legend>
                  Serie {s.setNumber} ·{" "}
                  {s.status === "RECORDED"
                    ? "Registrada"
                    : s.status === "SKIPPED"
                      ? "Omitida"
                      : "Pendiente"}
                </legend>
                <p className="set-prescription">
                  Prescrito: {s.weight ?? "—"} kg · {s.reps ?? "—"} reps · RPE{" "}
                  {s.rpe ?? "—"}
                </p>
                <div className="performed-set-fields">
                  {(["weight", "reps", "rpe"] as const).map((field) => (
                    <label key={field}>
                      {field === "weight"
                        ? "Peso (kg)"
                        : field === "reps"
                          ? "Reps"
                          : "RPE"}
                      <input
                        aria-label={`${field === "weight" ? "Peso" : field === "reps" ? "Reps" : "RPE"} serie ${s.setNumber} de ${exercise.name}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={
                          field === "rpe"
                            ? 10
                            : field === "reps"
                              ? 10000
                              : 9999.99
                        }
                        step={
                          field === "reps" ? 1 : field === "rpe" ? 0.1 : 0.01
                        }
                        value={s.actual[field] ?? ""}
                        onChange={(e) =>
                          update(exercise.id, s.setNumber, {
                            status: "RECORDED",
                            actual: {
                              ...s.actual,
                              [field]:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                {!initial.readOnly && (
                  <div className="set-actions">
                    <button
                      type="button"
                      className="button--secondary"
                      onClick={() =>
                        update(exercise.id, s.setNumber, {
                          status: "RECORDED",
                          actual: {
                            weight: s.weight,
                            reps: s.reps,
                            rpe: s.rpe,
                          },
                        })
                      }
                    >
                      ✓ Como prescrito
                    </button>
                    <button
                      type="button"
                      className="button--neutral"
                      onClick={() =>
                        update(exercise.id, s.setNumber, {
                          status: "SKIPPED",
                          actual: { weight: null, reps: null, rpe: null },
                        })
                      }
                    >
                      Omitir
                    </button>
                    <button
                      type="button"
                      className="button--neutral"
                      onClick={() =>
                        update(exercise.id, s.setNumber, {
                          status: "PENDING",
                          actual: { weight: null, reps: null, rpe: null },
                        })
                      }
                    >
                      Deshacer
                    </button>
                  </div>
                )}
              </fieldset>
            ))}
          </article>
        ))}
        {!draft.exercises.length && (
          <p className="training-notice">
            Día sin ejercicios programados. Puedes finalizarlo como omitido.
          </p>
        )}
        {!initial.readOnly && (
          <footer className="training-save-bar">
            <label className="field">
              Duración al finalizar (minutos, opcional)
              <input
                type="number"
                min="0"
                max="1440"
                step="1"
                value={duration}
                disabled={disabled}
                onChange={(e) => {
                  setDuration(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="submit"
                disabled={
                  disabled ||
                  !dirty ||
                  sets.every((s) => s.status === "PENDING")
                }
              >
                Guardar progreso
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  if (e.currentTarget.form?.reportValidity())
                    setConfirm("finish");
                }}
              >
                {draft.finished
                  ? "Actualizar sesión finalizada"
                  : "Finalizar sesión"}
              </button>
              <button
                type="button"
                className="button--neutral"
                disabled={disabled}
                onClick={() => setConfirm("skip")}
              >
                Omitir sesión
              </button>
            </div>
            <p role="status">
              {mutation.isPending
                ? "Guardando…"
                : draft.revision > 0 && !dirty
                  ? "Registro guardado."
                  : ""}
            </p>
            {mutation.isError && (
              <ErrorState message={mutation.error.message} />
            )}
          </footer>
        )}
      </form>
      {confirm && (
        <div
          className="training-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar registro"
        >
          <h2>
            {confirm === "skip"
              ? "¿Omitir toda la sesión?"
              : "Finalizar entrenamiento"}
          </h2>
          <p>
            {confirm === "skip"
              ? "Todas las series de esta sesión quedarán omitidas, incluidos los valores registrados."
              : `${done} series registradas. Las ${pending} pendientes quedarán omitidas. Después podrás corregir tu registro mientras el ciclo siga activo.`}
          </p>
          <div className="dialog-actions">
            <button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ finish: true, skip: confirm === "skip" })
              }
            >
              Confirmar
            </button>
            <button
              className="button--neutral"
              disabled={mutation.isPending}
              onClick={() => setConfirm(null)}
            >
              Cancelar
            </button>
          </div>
          {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        </div>
      )}
      {blocker.state === "blocked" && (
        <div
          className="training-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="Cambios sin guardar"
        >
          <h2>Tienes cambios sin guardar</h2>
          <button onClick={() => blocker.reset()}>Seguir registrando</button>
          <button onClick={() => blocker.proceed()}>Salir sin guardar</button>
        </div>
      )}
    </section>
  );
}
