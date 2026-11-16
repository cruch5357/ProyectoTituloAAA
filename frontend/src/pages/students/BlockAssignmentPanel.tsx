import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLibrary, useLibraryBlock } from "../../api/blockLibrary";
import {
  trainingLabels,
  useTraining,
  type TrainingAssignment,
  type TrainingSessionSummary,
} from "../../api/training";
import { apiClient } from "../../lib/apiClient";
import { todayDate } from "../../lib/calendarDate";
import { readableDate } from "../../lib/readableDate";
import {
  EmptyState,
  ErrorState,
  PeriodNavigator,
  Skeleton,
} from "../../components/ui/Primitives";
import "../student-training/training.css";
import { CoachWeekPlanPreview } from "./CoachWeekPlanPreview";

function initialCycleWeek(
  assignment: TrainingAssignment,
  sessions: TrainingSessionSummary[],
  totalWeeks: number,
  today: string,
): number {
  const currentWeek = assignment.currentWeek?.weekNumber;
  if (currentWeek && currentWeek >= 1 && currentWeek <= totalWeeks) {
    return currentWeek;
  }
  if (totalWeeks === 0) return 0;
  if (assignment.startDate && assignment.startDate.slice(0, 10) > today) {
    return 1;
  }
  if (
    assignment.status === "FINISHED" ||
    (assignment.startDate && assignment.startDate.slice(0, 10) <= today)
  ) {
    return totalWeeks;
  }
  const firstSessionWeek = Math.min(
    ...sessions
      .map((session) => session.weekNumber)
      .filter((weekNumber) => weekNumber >= 1 && weekNumber <= totalWeeks),
  );
  return Number.isFinite(firstSessionWeek) ? firstSessionWeek : 1;
}

function TrainingCycle({
  assignment,
  sessions,
  today,
}: {
  assignment: TrainingAssignment;
  sessions: TrainingSessionSummary[];
  today: string;
}) {
  const totalWeeks = Math.max(
    assignment.weekCount,
    0,
    ...sessions.map((session) => session.weekNumber),
  );
  const initialWeek = initialCycleWeek(
    assignment,
    sessions,
    totalWeeks,
    today,
  );
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const visibleWeek =
    selectedWeek !== null && selectedWeek >= 1 && selectedWeek <= totalWeeks
      ? selectedWeek
      : initialWeek;

  const visibleSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.weekNumber === visibleWeek)
        .slice()
        .sort((a, b) => a.dayNumber - b.dayNumber),
    [sessions, visibleWeek],
  );

  return (
    <article className="training-cycle">
      <p className="eyebrow">
        {assignment.legacy ? "Plan anterior conservado" : "Ciclo activo"}
      </p>
      <h3>{assignment.name}</h3>
      <p>
        Inicio:{" "}
        {assignment.startDate
          ? readableDate(assignment.startDate, false)
          : "Sin fecha configurada"}{" "}
        ·{" "}
        {assignment.currentWeek
          ? `Semana ${assignment.currentWeek.weekNumber} de ${totalWeeks}`
          : "Fuera del período del ciclo"}
      </p>
      <progress
        aria-label={`${assignment.finishedSessions} de ${assignment.totalSessions} sesiones finalizadas`}
        max={assignment.totalSessions || 1}
        value={assignment.finishedSessions}
      />
      <p>
        {assignment.finishedSessions} / {assignment.totalSessions} sesiones
        finalizadas · {assignment.adherence.completedSessions} completadas de{" "}
        {assignment.adherence.scheduledSessions} programadas hasta hoy
      </p>

      {totalWeeks > 0 ? (
        <>
          <PeriodNavigator
            className="training-cycle__pagination"
            ariaLabel={`Navegación por semanas de ${assignment.name}`}
            label={`Semana ${visibleWeek} de ${totalWeeks}`}
            onPrevious={() =>
              setSelectedWeek(Math.max(1, visibleWeek - 1))
            }
            onNext={() =>
              setSelectedWeek(Math.min(totalWeeks, visibleWeek + 1))
            }
            previousDisabled={visibleWeek <= 1}
            nextDisabled={visibleWeek >= totalWeeks}
          />
          <section
            className="training-week"
            aria-label={`Sesiones de la semana ${visibleWeek}`}
          >
            {visibleSessions.length > 0 ? (
              <div className="training-session-list">
                {visibleSessions.map((session) => (
                  <Link
                    key={session.id}
                    to={`/training/sessions/${session.sessionId}?assignmentId=${session.assignmentId}`}
                  >
                    <span>
                      Semana {session.weekNumber} · {session.name}
                    </span>
                    <small>
                      {session.date
                        ? readableDate(session.date, false)
                        : "Sin fecha"}{" "}
                      · {trainingLabels[session.status]}
                    </small>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="training-week__empty muted">
                Esta semana no contiene sesiones.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="training-week__empty muted">
          Este ciclo no contiene sesiones.
        </p>
      )}
    </article>
  );
}

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
      {query.data?.assignments.map((assignment) => (
        <TrainingCycle
          key={assignment.id}
          assignment={assignment}
          sessions={query.data.sessions.filter(
            (session) => session.assignmentId === assignment.id,
          )}
          today={query.data.today}
        />
      ))}
      {query.data?.weekPlan && <CoachWeekPlanPreview studentId={studentId} />}
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
