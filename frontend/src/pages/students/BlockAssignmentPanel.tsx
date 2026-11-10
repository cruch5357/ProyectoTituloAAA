import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLibrary, useLibraryBlock } from "../../api/blockLibrary";
import { trainingLabels, useTraining } from "../../api/training";
import { apiClient } from "../../lib/apiClient";
import { todayDate } from "../../lib/calendarDate";
import { readableDate } from "../../lib/readableDate";
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from "../../components/ui/Primitives";
import "../student-training/training.css";

export function BlockAssignmentPanel({ studentId }: { studentId: string }) {
  const query = useTraining(studentId);
  const blocks = useLibrary();
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState(todayDate());
  const [replace, setReplace] = useState(false);
  const detail = useLibraryBlock(selected);
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const cache = useQueryClient();
  const maxDays = Math.max(
    0,
    ...(detail.data?.weeks.map((w) => w.days.length) ?? []),
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        await apiClient.post(`/students/${studentId}/block-assignments`, {
          blockId: selected,
          startDate: date,
          replaceActive: replace,
        });
      } finally {
        busy.current = false;
      }
    },
    onSuccess: () => {
      dialog.current?.close();
      void cache.invalidateQueries({ queryKey: ["training"] });
      void cache.invalidateQueries({ queryKey: ["coaching"] });
    },
  });
  return (
    <section className="training-panel">
      <header className="page-header">
        <div>
          <p className="eyebrow">Planificación del alumno</p>
          <h2>Ciclo de entrenamiento</h2>
        </div>
        <button
          onClick={() => {
            mutation.reset();
            setReplace(false);
            dialog.current?.showModal();
          }}
        >
          Asignar bloque
        </button>
      </header>
      {query.isLoading && <Skeleton />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.data?.assignments.length === 0 && (
        <EmptyState
          title="Sin bloque asignado"
          description="Selecciona un bloque de tu biblioteca para iniciar el ciclo."
        />
      )}
      {query.data?.assignments.map((a) => (
        <article className="training-cycle" key={a.id}>
          <p className="eyebrow">
            {a.legacy ? "Plan anterior conservado" : "Ciclo activo"}
          </p>
          <h3>{a.name}</h3>
          <p>
            Inicio:{" "}
            {a.startDate
              ? readableDate(a.startDate, false)
              : "Sin fecha configurada"}{" "}
            ·{" "}
            {a.currentWeek
              ? `Semana ${a.currentWeek.weekNumber} de ${a.weekCount}`
              : "Fuera del período del ciclo"}
          </p>
          <progress max={a.totalSessions || 1} value={a.finishedSessions} />
          <p>
            {a.finishedSessions} / {a.totalSessions} sesiones finalizadas ·{" "}
            {a.adherence.completedSessions} completadas de{" "}
            {a.adherence.scheduledSessions} programadas hasta hoy
          </p>
          <div className="training-session-list">
            {query.data?.sessions
              .filter((s) => s.assignmentId === a.id)
              .map((s) => (
                <Link
                  key={s.id}
                  to={`/training/sessions/${s.sessionId}?assignmentId=${s.assignmentId}`}
                >
                  <span>
                    Semana {s.weekNumber} · {s.name}
                  </span>
                  <small>
                    {s.date ? readableDate(s.date, false) : "Sin fecha"} ·{" "}
                    {trainingLabels[s.status]}
                  </small>
                </Link>
              ))}
          </div>
        </article>
      ))}
      {query.data?.weekPlan && (
        <aside
          className={`training-week-plan__advice training-week-plan__advice--${query.data.weekPlan.assessment.level.toLowerCase()}`}
          role={
            query.data.weekPlan.assessment.level === "CAUTION" ||
            query.data.weekPlan.assessment.level === "HIGH"
              ? "alert"
              : "status"
          }
        >
          <strong>
            Organización semanal: {query.data.weekPlan.trainingDates.length} de{" "}
            {query.data.weekPlan.prescribedSessions} días
          </strong>
          <span>{query.data.weekPlan.assessment.message}</span>
          {query.data.weekPlan.trainingDates.length > 0 && (
            <small>
              Días elegidos: {query.data.weekPlan.trainingDates.join(", ")}
            </small>
          )}
        </aside>
      )}
      <dialog
        ref={dialog}
        className="assign-block-dialog"
        aria-label="Asignar bloque"
        onCancel={(e) => {
          if (mutation.isPending) e.preventDefault();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <h2>Asignar bloque</h2>
          <p>
            Se guardará una copia privada. Las futuras ediciones de tu
            biblioteca no cambiarán este ciclo.
          </p>
          {blocks.isLoading && <Skeleton />}
          {blocks.isError && <ErrorState retry={() => void blocks.refetch()} />}
          <label className="field">
            Bloque reusable
            <select
              aria-label="Bloque reusable"
              required
              value={selected}
              disabled={mutation.isPending}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Selecciona un bloque</option>
              {blocks.data?.map((b) => (
                <option
                  key={b.id}
                  value={b.id}
                  disabled={!!b.inactiveExercises?.length}
                >
                  {b.name} · {b.weekCount} semanas
                  {b.inactiveExercises?.length
                    ? " · Desactivado (usa ejercicios desactivados)"
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {!blocks.data?.length && blocks.isSuccess && (
            <Link to="/blocks">Crear un bloque en la biblioteca</Link>
          )}
          <label className="field">
            Fecha de inicio
            <input
              type="date"
              required
              value={date}
              disabled={mutation.isPending}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {selected && detail.isLoading && <Skeleton />}
          {selected && detail.isError && (
            <ErrorState retry={() => void detail.refetch()} />
          )}
          {detail.data && (
            <>
              <h3>Flexibilidad semanal</h3>
              <p className="muted">
                Las sesiones de cada semana estarán disponibles de lunes a
                domingo. La primera semana respetará la fecha de inicio y el
                alumno decidirá qué días entrenar.
              </p>
              {!maxDays && (
                <p role="alert">
                  Este bloque no tiene sesiones. Añádelas en la biblioteca antes
                  de asignarlo.
                </p>
              )}
              {!!maxDays && (
                <div className="assignment-preview">
                  <strong>Sesiones prescritas por semana</strong>
                  <p>
                    El bloque conserva sus días y prescripciones, sin fijarlos a
                    días concretos de la semana.
                  </p>
                </div>
              )}
            </>
          )}
          {!!query.data?.assignments.length && (
            <label className="replace-cycle">
              <input
                type="checkbox"
                checked={replace}
                disabled={mutation.isPending}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Cerrar el ciclo activo y reemplazarlo. Su historial se conserva.
            </label>
          )}
          {mutation.error && (
            <p role="alert" className="field-error">
              {mutation.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              disabled={
                mutation.isPending ||
                !selected ||
                !date ||
                !maxDays ||
                !query.isSuccess ||
                (!!query.data?.assignments.length && !replace)
              }
            >
              {mutation.isPending ? "Asignando…" : "Confirmar asignación"}
            </button>
            <button
              type="button"
              className="button--neutral"
              disabled={mutation.isPending}
              onClick={() => dialog.current?.close()}
            >
              Cancelar
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
