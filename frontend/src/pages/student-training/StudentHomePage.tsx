import { Link } from "react-router-dom";
import { useTraining, trainingLabels } from "../../api/training";
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from "../../components/ui/Primitives";
import { MUSCLE_GROUPS } from "../../lib/exerciseTaxonomy";
import { readableDate } from "../../lib/readableDate";
import { Adherence } from '../../components/coaching/Adherence';
import "./training.css";
export function StudentHomePage({ training = false }: { training?: boolean }) {
  const query = useTraining();
  if (query.isLoading) return <Skeleton label="Cargando tu entrenamiento…" />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const data = query.data;
  const focus = data.nextSession ?? data.pendingSession;
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
          <h1>{training ? "Entrenamiento" : "Tu próximo paso"}</h1>
        </div>
        <Link to="/calendar">Ver calendario →</Link>
      </header>
      {!data.assignments.length && (
        <EmptyState
          title="Tu próximo ciclo empieza aquí"
          description="Cuando tu coach te asigne un bloque, encontrarás tus sesiones y podrás registrar cada serie aquí."
        />
      )}
      {focus ? (
        <article className="training-hero">
          <p className="eyebrow">
            {focus.date === data.today
              ? "Tu sesión de hoy"
              : focus.date && focus.date < data.today
                ? "Sesión pendiente"
                : "Próxima sesión"}
          </p>
          <h2>{focus.name}</h2>
          <p>
            {focus.blockName} · Semana {focus.weekNumber} · Día{" "}
            {focus.dayNumber}
          </p>
          <p>
            {focus.date && readableDate(focus.date, false)} ·{" "}
            {focus.exerciseCount} ejercicios · {focus.totalSets} series
          </p>
          <Link className="button" to={`/training/sessions/${focus.sessionId}?assignmentId=${focus.assignmentId}`}>
            {focus.recordedSets
              ? "Continuar entrenamiento"
              : "Ver entrenamiento"}{" "}
            →
          </Link>
        </article>
      ) : (
        !!data.assignments.length && (
          <article className="training-cycle">
            <h2>Estás al día</h2>
            <p>Consulta tus sesiones abajo o revisa tu historial.</p>
          </article>
        )
      )}
      {!training && focus && (
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
      {data.pendingSession && data.nextSession && (
        <p className="training-notice">
          Tienes una sesión pendiente:{" "}
          <Link to={`/training/sessions/${data.pendingSession.sessionId}?assignmentId=${data.pendingSession.assignmentId}`}>
            {data.pendingSession.name}
          </Link>
          . Puedes registrarla u omitirla.
        </p>
      )}
      {data.assignments.map((a) => (
        <article className="training-cycle" key={a.id}>
          <p className="eyebrow">Tu ciclo activo</p>
          <h2>{a.name}</h2>
          <p>
            {a.currentWeek
              ? `Semana ${a.currentWeek.weekNumber} de ${a.weekCount}`
              : a.startDate
                ? `Inicio: ${readableDate(a.startDate, false)}`
                : "Sin fecha de inicio"}
          </p>
          <progress max={a.totalSessions || 1} value={a.finishedSessions} />
          <p>
            {a.finishedSessions} de {a.totalSessions} sesiones finalizadas
          </p>
          <div className="training-session-list">
            {data.sessions
              .filter((s) => s.assignmentId === a.id)
              .map((s) => (
                <Link
                  key={s.id}
                  to={`/training/sessions/${s.sessionId}?assignmentId=${s.assignmentId}`}
                  aria-current={s.id === focus?.id ? "step" : undefined}
                >
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      Semana {s.weekNumber} · Día {s.dayNumber} ·{" "}
                      {s.date ? readableDate(s.date, false) : "Sin fecha"}
                    </small>
                  </span>
                  <span
                    className={`training-status training-status--${s.status}`}
                  >
                    {trainingLabels[s.status]}
                    <small>
                      {s.recordedSets}/{s.totalSets} series
                    </small>
                  </span>
                </Link>
              ))}
          </div>
          {!data.sessions.some((s) => s.assignmentId === a.id) && (
            <p>Este ciclo no tiene sesiones. Contacta con tu coach.</p>
          )}
        </article>
      ))}
      {!training && <Adherence assignments={data.assignments} />}
      <footer className="training-links">
        <Link to="/history">Historial y progreso →</Link>
        <Link to="/messages">Hablar con mi coach →</Link>
      </footer>
    </section>
  );
}
