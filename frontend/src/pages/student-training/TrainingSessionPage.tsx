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
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../auth/useAuth";
import {
  fillEmptyActual,
  hasActualValues,
  prescribedActual,
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
      key={`${id}:${assignmentId}:${query.data.workoutLogId ?? "not-started"}`}
      initial={query.data}
      queryAssignmentId={assignmentId}
    />
  ) : null;
}

function CorrectionRequestForm({ session }: { session: TrainingDetail }) {
  const [open, setOpen] = useState(
    () => window.location.hash === "#correction",
  );
  const [exerciseId, setExerciseId] = useState(session.exercises[0]?.id ?? "");
  const exercise = session.exercises.find((item) => item.id === exerciseId);
  const [setNumber, setSetNumber] = useState(exercise?.sets[0]?.setNumber ?? 1);
  const selectedSet = exercise?.sets.find((set) => set.setNumber === setNumber);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rpe, setRpe] = useState("");
  const [reason, setReason] = useState("");
  const request = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post(`/training/sessions/${session.id}/corrections`, {
          assignmentId: session.assignmentId,
          sessionExerciseId: exerciseId,
          setNumber,
          ...(weight !== "" ? { weight: Number(weight) } : {}),
          ...(reps !== "" ? { reps: Number(reps) } : {}),
          ...(rpe !== "" ? { rpe: Number(rpe) } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        })
      ).data,
  });
  if (!session.canRequestCorrection || !session.exercises.length) return null;
  if (request.isSuccess)
    return (
      <p className="training-notice" role="status">
        Tu solicitud fue enviada al coach. Los datos no cambiarán hasta que sea
        aprobada.
      </p>
    );
  return (
    <section id="correction" className="training-correction">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}>
          Solicitar corrección al coach
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            request.mutate();
          }}
        >
          <h2>Solicitar corrección al coach</h2>
          <p>
            Este entrenamiento está cerrado. La solicitud no cambiará los datos
            hasta que tu coach la apruebe.
          </p>
          <label className="field">
            Ejercicio
            <select
              value={exerciseId}
              onChange={(event) => {
                const next = session.exercises.find(
                  (item) => item.id === event.target.value,
                );
                setExerciseId(event.target.value);
                setSetNumber(next?.sets[0]?.setNumber ?? 1);
              }}
            >
              {session.exercises.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Serie prescrita
            <select
              value={setNumber}
              onChange={(event) => setSetNumber(Number(event.target.value))}
            >
              {exercise?.sets.map((set) => (
                <option key={set.setNumber} value={set.setNumber}>
                  Serie {set.setNumber} de {exercise.sets.length}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Registro original:{" "}
            {selectedSet?.status === "RECORDED"
              ? `${selectedSet.actual.weight ?? "—"} kg · ${selectedSet.actual.reps ?? "—"} repeticiones · RPE ${selectedSet.actual.rpe ?? "—"}`
              : "Sin datos"}
          </p>
          <div className="performed-set-fields">
            <label>
              Peso (kg)
              <input
                aria-label="Peso corregido"
                type="number"
                min="0"
                max="9999.99"
                step="0.01"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            </label>
            <label>
              Repeticiones
              <input
                aria-label="Repeticiones corregidas"
                type="number"
                min="0"
                max="10000"
                step="1"
                value={reps}
                onChange={(event) => setReps(event.target.value)}
              />
            </label>
            <label>
              RPE
              <input
                aria-label="RPE corregido"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={rpe}
                onChange={(event) => setRpe(event.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Motivo opcional
            <textarea
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="dialog-actions">
            <button disabled={request.isPending || (!weight && !reps && !rpe)}>
              {request.isPending ? "Enviando…" : "Enviar solicitud"}
            </button>
            <button
              type="button"
              className="button--neutral"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </div>
          {request.isError && <ErrorState message={request.error.message} />}
        </form>
      )}
    </section>
  );
}

function exerciseExecutionState(exercise: TrainingDetail["exercises"][number]) {
  const recorded = exercise.sets.filter(
    (set) => set.status === "RECORDED",
  ).length;
  if (exercise.sets.length > 0 && recorded === exercise.sets.length)
    return "COMPLETED" as const;
  if (
    exercise.sets.length > 0 &&
    exercise.sets.every((set) => set.status === "SKIPPED")
  )
    return "SKIPPED" as const;
  if (exercise.sets.some((set) => set.status !== "PENDING"))
    return "PARTIAL" as const;
  return "PENDING" as const;
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
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [setOverrides, setSetOverrides] = useState<Record<string, boolean>>({});
  const isSetOpen = (exerciseId: string, set: TrainingSet) =>
    setOverrides[`${exerciseId}:${set.setNumber}`] ?? false;
  const saving = useRef(false);
  const [localSaved, setLocalSaved] = useState(false);
  const [confirm, setConfirm] = useState<"finish" | "skip" | null>(null);
  const cache = useQueryClient();
  const start = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<TrainingDetail>(
          `/training/sessions/${initial.id}/start`,
          { assignmentId: initial.assignmentId },
        )
      ).data,
    onSuccess: (data) => {
      cache.setQueryData(
        ["training-session", data.id, queryAssignmentId],
        data,
      );
      void cache.invalidateQueries({ queryKey: ["training"] });
    },
  });
  function persist(value: TrainingDetail) {
    if (initial.readOnly) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(serializeDraft(value)));
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
    mutationFn: async (variables: {
      finish: boolean;
      skip?: boolean;
      value: TrainingDetail;
      collapseSetKey?: string;
    }) => {
      const { finish, skip = false, value: submitted } = variables;
      const value = skip
        ? {
            ...submitted,
            exercises: submitted.exercises.map((e) => ({
              ...e,
              sets: e.sets.map((s) =>
                s.status === "RECORDED"
                  ? s
                  : { ...s, status: "SKIPPED" as const },
              ),
            })),
          }
        : submitted;
      return (
        await apiClient.patch<TrainingDetail>(
          `/training/sessions/${draft.id}`,
          trainingPayload(value, finish),
        )
      ).data;
    },
    onSuccess: (data, variables) => {
      const next = variables.finish
        ? data
        : retainUnrecordedInputs(data, variables.value);
      setDraft(next);
      const hasUnconfirmed = next.exercises.some((exercise) =>
        exercise.sets.some(
          (set) => set.status === "PENDING" && hasActualValues(set),
        ),
      );
      if (!hasUnconfirmed) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          setStorageError(true);
        }
      } else persist(next);
      setDirty(hasUnconfirmed);
      setLocalSaved(false);
      setConfirm(null);
      if (variables.collapseSetKey)
        setSetOverrides((current) => ({
          ...current,
          [variables.collapseSetKey!]: false,
        }));
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
    collapseSetKey?: string,
  ) {
    if (saving.current || initial.readOnly || conflictingDraft) return;
    saving.current = true;
    mutation.mutate({
      value,
      finish,
      skip,
      collapseSetKey,
    });
  }
  const sets = draft.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.status === "RECORDED").length;
  const filledPending = sets.filter(
    (s) => s.status === "PENDING" && hasActualValues(s),
  ).length;
  function update(
    exerciseId: string,
    setNumber: number,
    changes: Partial<TrainingSet>,
  ) {
    const next = updateSet(draft, exerciseId, setNumber, changes);
    setDraft(next);
    persist(next);
    setDirty(true);
    setLocalSaved(false);
    return next;
  }
  function saveProgress() {
    const hasServerDecision = draft.exercises.some((exercise) =>
      exercise.sets.some((set) => set.status !== "PENDING"),
    );
    if (!draft.workoutLogId && !hasServerDecision) {
      persist(draft);
      setLocalSaved(true);
      return;
    }
    save();
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
        {draft.finished && (
          <p className="muted">
            Duración:{" "}
            {draft.durationMinutes !== null
              ? `${draft.durationMinutes} min`
              : "no disponible"}
          </p>
        )}
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
      {initial.canStartEarly && (
        <div className="training-notice">
          <p>
            Esta es tu siguiente sesión elegible. Puedes adelantarla; quedará
            registrada con la fecha real de inicio y será tu único entrenamiento
            activo.
          </p>
          <button
            type="button"
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? "Iniciando…" : "Iniciar anticipadamente"}
          </button>
          {start.isError && <ErrorState message={start.error.message} />}
        </div>
      )}
      {user?.role === "STUDENT" && <CorrectionRequestForm session={initial} />}
      {!initial.readOnly && (
        <p className="muted">
          Anota cada serie al terminarla. Escribir o autocompletar valores no
          los registra: debes pulsar «Anotar». Solo puedes registrar las series
          programadas por tu coach.
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
          saveProgress();
        }}
      >
        {draft.exercises.map((exercise, index) => {
          const exerciseState = exerciseExecutionState(exercise);
          const exerciseOpen = openExerciseId === exercise.id;
          return (
            <article
              className={`training-exercise training-exercise--compact training-exercise--${exerciseState}`}
              key={exercise.id}
            >
              <header>
                <button
                  type="button"
                  className="training-accordion-toggle"
                  aria-expanded={exerciseOpen}
                  aria-controls={`exercise-${exercise.id}`}
                  onClick={() =>
                    setOpenExerciseId((current) =>
                      current === exercise.id ? null : exercise.id,
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
                      {exerciseState === "PENDING"
                        ? "Pendiente"
                        : exerciseState === "COMPLETED"
                          ? "Completado"
                          : exerciseState === "SKIPPED"
                            ? "Omitido"
                            : "Parcial"}
                    </span>
                  </span>
                  <span aria-hidden="true" className="training-chevron">
                    {exerciseOpen ? "−" : "+"}
                  </span>
                </button>
              </header>
              <div
                id={`exercise-${exercise.id}`}
                className="training-collapse"
                data-open={exerciseOpen}
                inert={!exerciseOpen}
                aria-hidden={!exerciseOpen}
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
                        aria-expanded={isSetOpen(exercise.id, s)}
                        aria-controls={`set-${exercise.id}-${s.setNumber}`}
                        onClick={() =>
                          setSetOverrides((current) => ({
                            ...current,
                            [`${exercise.id}:${s.setNumber}`]: !isSetOpen(
                              exercise.id,
                              s,
                            ),
                          }))
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
                              {s.actual.weight ?? "—"} kg ·{" "}
                              {s.actual.reps ?? "—"} reps · @
                              {s.actual.rpe ?? "—"}
                            </small>
                          )}
                        </span>
                        <span className="training-chevron" aria-hidden="true">
                          {isSetOpen(exercise.id, s) ? "−" : "+"}
                        </span>
                      </button>
                      <div
                        id={`set-${exercise.id}-${s.setNumber}`}
                        className="training-collapse"
                        data-open={isSetOpen(exercise.id, s)}
                        inert={!isSetOpen(exercise.id, s)}
                        aria-hidden={!isSetOpen(exercise.id, s)}
                      >
                        <div className="training-collapse-inner">
                          <fieldset
                            className={`performed-set performed-set--${s.status}`}
                            disabled={disabled || !isSetOpen(exercise.id, s)}
                            aria-label={`${exercise.name}, serie ${s.setNumber}`}
                          >
                            <p className="set-prescription">
                              Prescrito: {s.weight ?? "—"} kg · {s.reps ?? "—"}{" "}
                              reps · RPE {s.rpe ?? "—"}
                            </p>
                            {!initial.readOnly && (
                              <button
                                type="button"
                                className="set-use-prescription"
                                disabled={
                                  disabled ||
                                  [s.weight, s.reps, s.rpe].every(
                                    (value) => value === null,
                                  )
                                }
                                onClick={() =>
                                  update(exercise.id, s.setNumber, {
                                    actual: prescribedActual(s),
                                  })
                                }
                              >
                                Usar valores prescritos
                              </button>
                            )}
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
                                    save(
                                      next,
                                      false,
                                      false,
                                      `${exercise.id}:${s.setNumber}`,
                                    );
                                  }}
                                >
                                  Anotar
                                </button>
                                <button
                                  type="button"
                                  className="button--neutral"
                                  onClick={() => {
                                    const next = update(
                                      exercise.id,
                                      s.setNumber,
                                      {
                                        status: "SKIPPED",
                                      },
                                    );
                                    save(
                                      next,
                                      false,
                                      false,
                                      `${exercise.id}:${s.setNumber}`,
                                    );
                                  }}
                                >
                                  Omitir
                                </button>
                                <button
                                  type="button"
                                  className="button--neutral"
                                  onClick={() => {
                                    const next = update(
                                      exercise.id,
                                      s.setNumber,
                                      {
                                        status: "PENDING",
                                      },
                                    );
                                    const key = `${exercise.id}:${s.setNumber}`;
                                    if (s.status === "PENDING") {
                                      setSetOverrides((current) => ({
                                        ...current,
                                        [key]: false,
                                      }));
                                    } else {
                                      save(next, false, false, key);
                                    }
                                  }}
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
          );
        })}
        {!draft.exercises.length && (
          <p className="training-notice">
            Día sin ejercicios programados. Puedes finalizarlo como omitido.
          </p>
        )}
        {!initial.readOnly && (
          <footer className="training-save-bar">
            <div className="training-save-actions">
              <button
                type="submit"
                className="training-action training-action--save"
                disabled={disabled || !dirty}
              >
                <Icon name="save" />
                {mutation.isPending ? "Guardando…" : "Guardar progreso"}
              </button>
              <button
                type="button"
                className="training-action training-action--finish"
                disabled={disabled}
                onClick={(e) => {
                  if (e.currentTarget.form?.reportValidity())
                    setConfirm("finish");
                }}
              >
                <Icon name="check" />
                Finalizar sesión
              </button>
              <button
                type="button"
                className="training-action training-action--skip"
                disabled={disabled}
                onClick={() => setConfirm("skip")}
              >
                <Icon name="skip" />
                Omitir sesión
              </button>
            </div>
            <p role="status">
              {mutation.isPending
                ? "Guardando…"
                : localSaved
                  ? "Borrador conservado en esta pestaña. Aún debes anotar la serie."
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
              : "Estás por finalizar tu entrenamiento."}
          </h2>
          <p>
            {confirm === "skip"
              ? done
                ? `Se conservarán tus ${done} series registradas. Las ${sets.length - done} restantes quedarán omitidas y la sesión se cerrará como parcial.`
                : `Las ${sets.length} series prescritas quedarán omitidas y la sesión se cerrará.`
              : `Registraste ${done} de ${sets.length} series. ${sets.length - done ? `Las ${sets.length - done} series restantes quedarán como omitidas.` : "Todas las series están registradas."}`}
          </p>
          {filledPending > 0 && (
            <p className="training-confirm__warning" role="alert">
              Hay {filledPending} {filledPending === 1 ? "serie" : "series"}
              con valores escritos o autocompletados sin confirmar. Si finalizas
              ahora, esos valores no se registrarán.
            </p>
          )}
          <div className="dialog-actions">
            <button
              disabled={mutation.isPending}
              onClick={() => save(draft, true, confirm === "skip")}
            >
              {confirm === "skip"
                ? "Omitir pendientes y cerrar"
                : "Finalizar y omitir restantes"}
            </button>
            <button
              className="button--neutral"
              disabled={mutation.isPending}
              onClick={() => setConfirm(null)}
            >
              Seguir entrenando
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
