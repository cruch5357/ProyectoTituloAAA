import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useTraining,
  trainingLabels,
  type TrainingAssignment,
  type TrainingSessionSummary,
} from "../../api/training";
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from "../../components/ui/Primitives";
import { MUSCLE_GROUPS } from "../../lib/exerciseTaxonomy";
import { readableDate } from "../../lib/readableDate";
import { Adherence } from "../../components/coaching/Adherence";
import { Icon } from "../../components/ui/Icon";
import { apiClient } from "../../lib/apiClient";
import "./training.css";
import { WeeklyTrainingPlanner } from "./WeeklyTrainingPlanner";

function TrainingSummaryCard({ session }: { session: TrainingSessionSummary }) {
  const label =
    session.availability === "IN_PROGRESS"
      ? "Entrenamiento en curso"
      : "Disponible esta semana";
  const action = session.finished
    ? "Revisar entrenamiento"
    : session.availability === "IN_PROGRESS"
      ? "Continuar entrenamiento"
      : "Iniciar entrenamiento";
  return (
    <Link className="training-today-card" to="/training">
      <span>
        <span className="eyebrow">{label}</span>
        <strong>{session.name}</strong>
        <small>
          {session.blockName} · Semana {session.weekNumber}
          {session.suggestedDate
            ? ` · Sugerido: ${readableDate(session.suggestedDate, false)}`
            : " · Sin día fijo"}
        </small>
      </span>
      <span className={`training-status training-status--${session.status}`}>
        {trainingLabels[session.status]}
      </span>
      <span className="training-today-card__action">{action} →</span>
    </Link>
  );
}

function ExpiredSessionNotice({
  session,
}: {
  session: TrainingSessionSummary;
}) {
  const cache = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const href = `/training/sessions/${session.sessionId}?assignmentId=${session.assignmentId}`;
  const omitted = session.status === "SKIPPED";
  const alreadyOmitted = omitted && session.finished;
  const closeLabel =
    session.recordedSets > 0
      ? "Cerrar y omitir series pendientes"
      : "Omitir entrenamiento";
  const dismiss = useMutation({
    mutationFn: () =>
      apiClient.post(
        `/training/sessions/${session.sessionId}/${alreadyOmitted ? "dismiss" : "close"}`,
        {
          assignmentId: session.assignmentId,
        },
      ),
    onSuccess: () => {
      setHidden(true);
      void cache.invalidateQueries({ queryKey: ["training"] });
    },
  });
  if (hidden) return null;
  return (
    <aside className="training-expired-notice">
      <p className="eyebrow">
        {omitted ? "Entrenamiento omitido" : "Entrenamiento cerrado"}
      </p>
      <h2>{session.name}</h2>
      <p>
        Semana finalizada
        {session.weekEnd
          ? ` el ${readableDate(session.weekEnd, false).toLocaleLowerCase("es-CL")}`
          : ""}
      </p>
      <p>
        <strong>
          {alreadyOmitted
            ? "No registraste este entrenamiento antes de terminar su semana. Se marcó como omitido."
            : omitted
              ? "No registraste este entrenamiento antes de terminar su semana. Confirma la omisión para cerrar la sesión."
              : "El entrenamiento conserva las series registradas, pero su semana ya terminó y quedó cerrado."}
        </strong>
      </p>
      <div className="training-expired-notice__actions">
        <div className="training-expired-notice__links">
          <Link to={href}>Ver detalle</Link>
          <Link to={`${href}#correction`}>Solicitar corrección</Link>
        </div>
        {!confirmingClose && (
          <button
            type="button"
            className="training-expired-notice__dismiss"
            disabled={dismiss.isPending}
            onClick={() =>
              alreadyOmitted ? dismiss.mutate() : setConfirmingClose(true)
            }
          >
            <Icon name={alreadyOmitted ? "hide" : "skip"} />
            {dismiss.isPending
              ? "Ocultando…"
              : alreadyOmitted
                ? "Ocultar aviso"
                : closeLabel}
          </button>
        )}
        {confirmingClose && (
          <div
            className="training-expired-notice__confirmation"
            role="alertdialog"
            aria-label="Confirmar omisión del entrenamiento"
          >
            <p>
              {session.recordedSets > 0
                ? "Se conservarán las series registradas y las restantes quedarán omitidas."
                : "Todas las series prescritas quedarán omitidas y la sesión se cerrará."}
            </p>
            <div>
              <button
                type="button"
                className="training-expired-notice__dismiss"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate()}
              >
                <Icon name="skip" />
                {dismiss.isPending ? "Cerrando…" : "Confirmar omisión"}
              </button>
              <button
                type="button"
                className="button--neutral"
                disabled={dismiss.isPending}
                onClick={() => setConfirmingClose(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      {dismiss.isError && (
        <p className="training-expired-notice__error" role="alert">
          No pudimos completar la acción. Inténtalo nuevamente.
        </p>
      )}
    </aside>
  );
}

function ActiveCycle({
  assignment,
  sessions,
  focusedSessionId,
}: {
  assignment: TrainingAssignment;
  sessions: TrainingSessionSummary[];
  focusedSessionId?: string;
}) {
  const currentWeek = assignment.currentWeek?.weekNumber ?? null;
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const availableWeeks =
    currentWeek == null
      ? []
      : Array.from(
          { length: Math.min(3, currentWeek) },
          (_, index) => currentWeek - index,
        );
  const visibleSessions =
    selectedWeek == null
      ? []
      : sessions
          .filter((session) => session.weekNumber === selectedWeek)
          .slice()
          .sort((a, b) => a.dayNumber - b.dayNumber);
  return (
    <article className="training-cycle">
      <p className="eyebrow">Tu ciclo activo</p>
      <h2>{assignment.name}</h2>
      <p className="training-cycle__progress-label">
        {currentWeek
          ? `Semana ${currentWeek} de ${assignment.weekCount}`
          : assignment.startDate
            ? `Inicio: ${readableDate(assignment.startDate, false)}`
            : "Sin fecha de inicio"}
      </p>
      {assignment.currentWeek && (
        <p className="muted">
          {readableDate(assignment.currentWeek.availableFrom, false)} –{" "}
          {readableDate(assignment.currentWeek.weekEnd, false)} · Puedes
          distribuir las sesiones libremente hasta el domingo.
        </p>
      )}
      <progress
        aria-label={`${assignment.finishedSessions} de ${assignment.totalSessions} sesiones finalizadas`}
        max={assignment.totalSessions || 1}
        value={assignment.finishedSessions}
      />
      <p className="training-cycle__summary">
        {assignment.finishedSessions} de {assignment.totalSessions} sesiones
        finalizadas
      </p>
      {availableWeeks.length > 0 && (
        <label className="training-week-picker">
          <span>Semana visible</span>
          <select
            aria-label={`Semana visible de ${assignment.name}`}
            value={selectedWeek ?? ""}
            onChange={(event) => setSelectedWeek(Number(event.target.value))}
          >
            {availableWeeks.map((week) => (
              <option key={week} value={week}>
                Semana {week}
                {week === currentWeek ? " · Actual" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedWeek != null && (
        <section
          className="training-week"
          aria-label={`Sesiones de la semana ${selectedWeek}`}
        >
          <div className="training-session-list">
            {visibleSessions.map((session) => (
              <Link
                key={session.id}
                to={`/training/sessions/${session.sessionId}?assignmentId=${session.assignmentId}`}
                aria-current={
                  session.id === focusedSessionId ? "step" : undefined
                }
              >
                <span>
                  <strong>{session.name}</strong>
                  <small>
                    Semana {session.weekNumber} · Día {session.dayNumber}
                    {session.actualDate
                      ? ` · ${session.finished ? "Realizado" : "Iniciado"}: ${readableDate(session.actualDate, false)}`
                      : session.suggestedDate
                        ? ` · Sugerido: ${readableDate(session.suggestedDate, false)}`
                        : " · Sin día fijo"}
                  </small>
                </span>
                <span
                  className={`training-status training-status--${session.status}`}
                >
                  {trainingLabels[session.status]}
                  <small>
                    {session.recordedSets}/{session.totalSets} series
                  </small>
                  <small>
                    {session.availability === "IN_PROGRESS"
                      ? "Continuar entrenamiento"
                      : session.availability === "AVAILABLE"
                        ? "Iniciar entrenamiento"
                        : session.finished
                          ? "Consultar"
                          : (session.startBlockedReason ?? "Solo lectura")}
                  </small>
                </span>
              </Link>
            ))}
          </div>
          {visibleSessions.length === 0 && (
            <p className="muted training-week__empty">
              Esta semana no tiene sesiones programadas.
            </p>
          )}
        </section>
      )}
      {currentWeek == null && sessions.length === 0 && (
        <p>Este ciclo no tiene sesiones. Contacta con tu coach.</p>
      )}
      {currentWeek == null && sessions.length > 0 && (
        <p className="muted">Este ciclo aún no tiene una semana activa.</p>
      )}
    </article>
  );
}

export function StudentHomePage({ training = false }: { training?: boolean }) {
  const query = useTraining();
  if (query.isLoading) return <Skeleton label="Cargando tu entrenamiento…" />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const data = query.data;
  const focus =
    data.nextSession?.availability === "AVAILABLE" ||
    data.nextSession?.availability === "IN_PROGRESS"
      ? data.nextSession
      : null;
  const homeFocus = focus;
  const muscles = MUSCLE_GROUPS.filter((g) =>
    focus?.muscleGroups.some(
      (k) =>
        k === g.key || k.toLocaleLowerCase() === g.label.toLocaleLowerCase(),
    ),
  );
  return (
    <section className="training-home">
      <header className="page-header">
        <div>
          <p className="eyebrow">Tu espacio de entrenamiento</p>
          <h1>{training ? "Tu próximo paso" : "Tu ciclo de entrenamiento"}</h1>
        </div>
        <Link to="/calendar">Ver calendario →</Link>
      </header>
      {!data.assignments.length && (
        <EmptyState
          title="Tu próximo ciclo empieza aquí"
          description="Cuando tu coach te asigne un bloque, encontrarás tus sesiones y podrás registrar cada serie aquí."
        />
      )}
      {!training && homeFocus && <TrainingSummaryCard session={homeFocus} />}
      {!training && data.pendingSession && (
        <ExpiredSessionNotice session={data.pendingSession} />
      )}
      {!training && !homeFocus && !!data.assignments.length && (
        <article className="training-today-empty">
          <p className="eyebrow">Tu entrenamiento</p>
          <h2>No hay sesiones disponibles esta semana</h2>
          <p>Revisa el ciclo o el calendario para consultar otras semanas.</p>
        </article>
      )}
      {training && focus ? (
        <article className="training-hero">
          <p className="eyebrow">
            {focus.availability === "IN_PROGRESS"
              ? "Entrenamiento en curso"
              : "Disponible esta semana"}
          </p>
          <h2>{focus.name}</h2>
          <p>
            {focus.blockName} · Semana {focus.weekNumber} · Día{" "}
            {focus.dayNumber}
          </p>
          <p>
            {focus.suggestedDate
              ? `Sugerido: ${readableDate(focus.suggestedDate, false)} · `
              : "Sin día fijo · "}
            {focus.exerciseCount} ejercicios · {focus.totalSets} series
          </p>
          <Link
            className="button"
            to={`/training/sessions/${focus.sessionId}?assignmentId=${focus.assignmentId}`}
          >
            {focus.availability === "IN_PROGRESS"
              ? "Continuar entrenamiento"
              : "Iniciar entrenamiento"}{" "}
            →
          </Link>
        </article>
      ) : (
        training &&
        !!data.assignments.length && (
          <article className="training-cycle">
            <h2>Estás al día</h2>
            <p>Consulta tus sesiones abajo o revisa tu historial.</p>
          </article>
        )
      )}
      {training && focus && (
        <section className="training-muscles">
          <h2>Qué vas a trabajar</h2>
          {muscles.length ? (
            <div className="training-muscle-grid">
              {muscles.map((g) => (
                <figure key={g.key}>
                  <img src={g.image} alt={`Zona muscular: ${g.label}`} />
                  <figcaption>
                    <strong>{g.label}</strong>
                    <small>{g.detail}</small>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="muted">
              Tu coach aún no ha indicado los grupos musculares de esta sesión.
            </p>
          )}
        </section>
      )}
      {training && data.pendingSession && (
        <ExpiredSessionNotice session={data.pendingSession} />
      )}
      {training && data.weekPlan && (
        <WeeklyTrainingPlanner
          key={`${data.weekPlan.assignmentId}:${data.weekPlan.weekIndex}`}
          plan={data.weekPlan}
        />
      )}
      {data.assignments.map((assignment) => (
        <ActiveCycle
          key={`${training ? "training" : "home"}:${assignment.id}:${assignment.currentWeek?.weekNumber ?? "none"}`}
          assignment={assignment}
          sessions={data.sessions.filter(
            (session) => session.assignmentId === assignment.id,
          )}
          focusedSessionId={homeFocus?.id}
        />
      ))}
      {!training && (
        <Adherence assignments={data.assignments} today={data.today} />
      )}
      <footer className="training-links">
        <Link to="/history">Historial y progreso →</Link>
        <Link to="/messages">Hablar con mi coach →</Link>
      </footer>
    </section>
  );
}
