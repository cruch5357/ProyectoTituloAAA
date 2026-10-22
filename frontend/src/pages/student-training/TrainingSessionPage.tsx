import { useRef, useState } from "react";
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
import {
  fillEmptyActual,
  firstPending,
  restoreDraft,
  retainUnrecordedInputs,
  serializeDraft,
  updateSet,
  type ExecutionDraft,
} from "./execution-draft";
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
  const storageKey = `execution-draft:${user?.id}:${initial.assignmentId}:${initial.id}`;
  const [recovery] = useState(() => {
    if (initial.readOnly) return null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const saved = JSON.parse(raw) as ExecutionDraft;
      const value = restoreDraft(initial, saved);
      return { saved, value, conflict: saved.revision !== initial.revision };
    } catch {
      return null;
    }
  });
  const [conflictingDraft, setConflictingDraft] = useState(
    recovery?.conflict ? recovery.saved : null,
  );
  const [draft, setDraft] = useState(
    recovery && !recovery.conflict ? recovery.value : initial,
  );
  const [dirty, setDirty] = useState(!!recovery && !recovery.conflict);
  const [storageError, setStorageError] = useState(false);
  const [open, setOpen] = useState(() =>
    firstPending(recovery && !recovery.conflict ? recovery.value : initial),
  );
  const saving = useRef(false);
  const [duration, setDuration] = useState(
    recovery && !recovery.conflict
      ? recovery.saved.duration
      : (initial.durationMinutes?.toString() ?? ""),
  );
  const [confirm, setConfirm] = useState<"finish" | "skip" | null>(null);
  const cache = useQueryClient();
  function persist(value: TrainingDetail, minutes = duration) {
    if (initial.readOnly) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify(serializeDraft(value, minutes)),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  const blocker = useBlocker(dirty);
  useBeforeUnload((e) => {
    if (dirty) e.preventDefault();
  });
  const mutation = useMutation({
    mutationFn: async ({
      finish,
      skip = false,
      value: submitted,
    }: {
      finish: boolean;
      skip?: boolean;
      value: TrainingDetail;
      advance?: { exerciseId: string; setNumber: number };
    }) => {
      const value = skip
        ? {
            ...submitted,
            exercises: submitted.exercises.map((e) => ({
              ...e,
              sets: e.sets.map((s) => ({ ...s, status: "SKIPPED" as const })),
            })),
          }
        : submitted;
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
    onSuccess: (data, variables) => {
      const next = retainUnrecordedInputs(data, variables.value);
      setDraft(next);
      if (
        JSON.stringify(serializeDraft(next, duration)) ===
        JSON.stringify(serializeDraft(data, duration))
      ) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          setStorageError(true);
        }
      } else persist(next);
      setDirty(false);
      setConfirm(null);
      if (variables.advance && !variables.finish) {
        setOpen((current) =>
          current.exerciseId === variables.advance?.exerciseId &&
          current.setNumber === variables.advance?.setNumber
            ? firstPending(next)
            : current,
        );
      }
      cache.setQueryData(
        ["training-session", data.id, queryAssignmentId],
        data,
      );
      for (const key of ["training", "coaching", "workoutLogs", "dashboard"])
        void cache.invalidateQueries({ queryKey: [key] });
    },
    onSettled: () => {
      saving.current = false;
    },
  });
  function save(
    value = draft,
    finish = false,
    skip = false,
    advance?: { exerciseId: string; setNumber: number },
  ) {
    if (saving.current || initial.readOnly || conflictingDraft) return;
    saving.current = true;
    mutation.mutate({ value, finish, skip, advance });
  }
  const sets = draft.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.status === "RECORDED").length;
  const pending = sets.filter((s) => s.status === "PENDING").length;
  function update(
    exerciseId: string,
    setNumber: number,
    changes: Partial<TrainingSet>,
  ) {
    const next = updateSet(draft, exerciseId, setNumber, changes);
    setDraft(next);
    persist(next);
    setDirty(true);
    return next;
  }
  const disabled = initial.readOnly || mutation.isPending || !!conflictingDraft;
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
          Anota cada serie al terminarla. «Anotar» completa solo los campos
          vacíos con lo prescrito y guarda tus valores. Solo puedes registrar
          las series programadas por tu coach. Los campos pendientes se
          conservan en esta pestaña.
        </p>
      )}
      {storageError && (
        <p role="alert">
          No se pudo conservar el borrador en esta pestaña. Guarda las series
          antes de recargar.
        </p>
      )}
      {conflictingDraft && (
        <aside className="training-notice" role="alert">
          <p>
            Hay un borrador local de una versión anterior. El servidor tiene
            cambios más recientes. Revisa y copia los valores que necesites
            antes de descartarlo.
          </p>
          <ul className="training-recovery-values">
            {conflictingDraft.exercises.map((e) => (
              <li key={e.id}>
                {initial.exercises.find((x) => x.id === e.id)?.name ??
                  "Ejercicio anterior"}
                <ul>
                  {e.sets
                    .filter((s) =>
                      Object.values(s.actual).some((v) => v !== null),
                    )
                    .map((s) => (
                      <li key={s.setNumber}>
                        Serie {s.setNumber}: {s.actual.weight ?? "—"} kg ·{" "}
                        {s.actual.reps ?? "—"} reps · @{s.actual.rpe ?? "—"}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(storageKey);
              } catch {
                setStorageError(true);
              }
              setConflictingDraft(null);
            }}
          >
            Descartar borrador anterior y usar registro del servidor
          </button>
        </aside>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {draft.exercises.map((exercise, index) => (
          <article
            className="training-exercise training-exercise--compact"
            key={exercise.id}
          >
            <header>
              <button
                type="button"
                className="training-accordion-toggle"
                aria-expanded={open.exerciseId === exercise.id}
                aria-controls={`exercise-${exercise.id}`}
                onClick={() =>
                  setOpen(
                    open.exerciseId === exercise.id
                      ? { exerciseId: null, setNumber: null }
                      : {
                          exerciseId: exercise.id,
                          setNumber:
                            exercise.sets.find((s) => s.status === "PENDING")
                              ?.setNumber ?? null,
                        },
                  )
                }
              >
                <span className="training-exercise-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{exercise.name}</strong>
                  <span className="training-accordion-summary">
                    {
                      exercise.sets.filter((s) => s.status === "RECORDED")
                        .length
                    }
                    /{exercise.sets.length} series ·{" "}
                    {exercise.sets.every((s) => s.status === "PENDING")
                      ? "Pendiente"
                      : exercise.sets.every((s) => s.status === "RECORDED")
                        ? "Completado"
                        : exercise.sets.every((s) => s.status === "SKIPPED")
                          ? "Omitido"
                          : "Parcial"}
                  </span>
                </span>
                <span aria-hidden="true" className="training-chevron">
                  {open.exerciseId === exercise.id ? "−" : "+"}
                </span>
              </button>
            </header>
            <div
              id={`exercise-${exercise.id}`}
              className="training-collapse"
              data-open={open.exerciseId === exercise.id}
              inert={open.exerciseId !== exercise.id}
              aria-hidden={open.exerciseId !== exercise.id}
            >
              <div className="training-collapse-inner">
                {exercise.notes && (
                  <p className="training-exercise-notes">{exercise.notes}</p>
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
                  <div
                    className={`training-set-row performed-set--${s.status}`}
                    key={s.setNumber}
                  >
                    <button
                      type="button"
                      className="training-accordion-toggle"
                      aria-expanded={
                        open.exerciseId === exercise.id &&
                        open.setNumber === s.setNumber
                      }
                      aria-controls={`set-${exercise.id}-${s.setNumber}`}
                      onClick={() =>
                        setOpen({
                          exerciseId: exercise.id,
                          setNumber:
                            open.setNumber === s.setNumber ? null : s.setNumber,
                        })
                      }
                    >
                      <span>
                        Serie {s.setNumber} ·{" "}
                        {s.status === "RECORDED"
                          ? "Registrada"
                          : s.status === "SKIPPED"
                            ? "Omitida"
                            : "Pendiente"}
                        {s.status === "RECORDED" && (
                          <small className="training-accordion-summary">
                            {s.actual.weight ?? "—"} kg · {s.actual.reps ?? "—"}{" "}
                            reps · @{s.actual.rpe ?? "—"}
                          </small>
                        )}
                      </span>
                      <span className="training-chevron" aria-hidden="true">
                        {open.setNumber === s.setNumber ? "−" : "+"}
                      </span>
                    </button>
                    <div
                      id={`set-${exercise.id}-${s.setNumber}`}
                      className="training-collapse"
                      data-open={
                        open.exerciseId === exercise.id &&
                        open.setNumber === s.setNumber
                      }
                      inert={
                        open.exerciseId !== exercise.id ||
                        open.setNumber !== s.setNumber
                      }
                      aria-hidden={
                        open.exerciseId !== exercise.id ||
                        open.setNumber !== s.setNumber
                      }
                    >
                      <div className="training-collapse-inner">
                        <fieldset
                          className={`performed-set performed-set--${s.status}`}
                          disabled={
                            disabled ||
                            open.exerciseId !== exercise.id ||
                            open.setNumber !== s.setNumber
                          }
                          aria-label={`${exercise.name}, serie ${s.setNumber}`}
                        >
                          <p className="set-prescription">
                            Prescrito: {s.weight ?? "—"} kg · {s.reps ?? "—"}{" "}
                            reps · RPE {s.rpe ?? "—"}
                          </p>
                          <div className="performed-set-fields">
                            {(["weight", "reps", "rpe"] as const).map(
                              (field) => (
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
                                      field === "reps"
                                        ? 1
                                        : field === "rpe"
                                          ? 0.1
                                          : 0.01
                                    }
                                    value={s.actual[field] ?? ""}
                                    onChange={(e) =>
                                      update(exercise.id, s.setNumber, {
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
                              ),
                            )}
                          </div>
                          {!initial.readOnly && (
                            <div className="set-actions">
                              <button
                                type="button"
                                className="button--secondary"
                                onClick={(event) => {
                                  if (
                                    !event.currentTarget.form?.reportValidity()
                                  )
                                    return;
                                  const next = update(
                                    exercise.id,
                                    s.setNumber,
                                    {
                                      status: "RECORDED",
                                      actual: fillEmptyActual(s),
                                    },
                                  );
                                  save(next, false, false, {
                                    exerciseId: exercise.id,
                                    setNumber: s.setNumber,
                                  });
                                }}
                              >
                                Anotar
                              </button>
                              <button
                                type="button"
                                className="button--neutral"
                                onClick={() =>
                                  update(exercise.id, s.setNumber, {
                                    status: "SKIPPED",
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
                                  })
                                }
                              >
                                Dejar pendiente
                              </button>
                            </div>
                          )}
                        </fieldset>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                  persist(draft, e.target.value);
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
              onClick={() => save(draft, true, confirm === "skip")}
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
