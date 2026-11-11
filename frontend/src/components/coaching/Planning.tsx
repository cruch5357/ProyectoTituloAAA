import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { todayDate } from "../../lib/calendarDate";
import { trainingLabels } from "../../api/training";
import {
  displayDate,
  useCalendar,
  useCoachingMutation,
  useProfile,
  type CalendarSession,
  type Competition,
} from "../../api/coaching";
import { Card, ErrorState, Skeleton } from "../ui/Primitives";
import { RescheduleSession } from "./RescheduleSession";

export function SessionContext({ session }: { session: CalendarSession }) {
  const suggestedDate = session.suggestedDate ?? session.date;
  return (
    <>
      <h3>{session.name}</h3>
      <p>
        {session.programName} · {session.blockName} · Semana{" "}
        {session.weekNumber}
      </p>
      {session.actualDate ? (
        <p>
          {session.finished ? "Realizado" : "Iniciado"}:{" "}
          {displayDate(session.actualDate)}
        </p>
      ) : (
        <p>Fecha sugerida: {suggestedDate && displayDate(suggestedDate)}</p>
      )}
      {session.rescheduled && (
        <p>
          Sugerencia modificada · Original:{" "}
          {session.originalDate && displayDate(session.originalDate)}
        </p>
      )}
    </>
  );
}

export function NextCompetition({
  competition,
  today,
}: {
  competition: Competition | null;
  today: string;
}) {
  return (
    <Card>
      <p className="eyebrow">Próximo hito</p>
      {competition ? (
        <>
          <h2>{competition.name}</h2>
          <p>
            {displayDate(competition.eventDate)} · {competition.category}
          </p>
          <p>
            {Math.round(
              (Date.parse(competition.eventDate.slice(0, 10)) -
                Date.parse(today)) /
                86_400_000,
            )}{" "}
            días restantes
          </p>
          {competition.goal && <p>{competition.goal}</p>}
          {competition.coachGoal && (
            <p>
              <strong>Tu coach:</strong> {competition.coachGoal}
            </p>
          )}
        </>
      ) : (
        <p>No tienes hitos próximos.</p>
      )}
      <Link to="/competitions">
        {competition ? "Ver hitos" : "Agregar hito"}
      </Link>
    </Card>
  );
}

export function MyCoach() {
  const query = useProfile();
  return (
    <Card>
      <h2>Mi Coach</h2>
      {query.isLoading && <Skeleton />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.data?.coach ? (
        <>
          <p>{query.data.coach.name}</p>
          <p>{query.data.coach.email}</p>
          <Link to={`/messages?peer=${query.data.coach.id}`}>
            Enviar mensaje
          </Link>
        </>
      ) : (
        query.isSuccess && <p>Sin coach asociado.</p>
      )}
    </Card>
  );
}

export function AssignmentDate({
  id,
  startDate,
}: {
  id: string;
  startDate?: string | null;
}) {
  const [value, setValue] = useState(startDate?.slice(0, 10) ?? "");
  const mutation = useCoachingMutation();
  return (
    <form
      className="date-editor"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({
          path: `/program-assignments/${id}/start-date`,
          data: { startDate: value },
        });
      }}
    >
      {!startDate && (
        <p className="muted">
          Esta asignación no tiene fecha de inicio configurada.
        </p>
      )}
      <label className="field">
        Fecha de inicio
        <input
          type="date"
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button disabled={mutation.isPending}>Guardar fecha</button>
      {mutation.isError && <ErrorState message={mutation.error.message} />}
      {mutation.isSuccess && <p role="status">Fecha guardada.</p>}
    </form>
  );
}

const WEEKDAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const capitalize = (text: string) =>
  text.charAt(0).toLocaleUpperCase("es-CL") + text.slice(1);

function stableBlockHue(blockId: string) {
  let hash = 2166136261;
  for (const character of blockId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 360);
}

function calendarBlockStyle(blockId: string): CSSProperties {
  return {
    "--calendar-block-hue": stableBlockHue(blockId),
  } as CSSProperties;
}

function sessionHref(session: CalendarSession) {
  return session.finished && session.workoutLogId
    ? `/workout-logs/${session.workoutLogId}`
    : `/training/sessions/${session.sessionId}?assignmentId=${session.assignmentId}`;
}

function CalendarSessionCard({ session }: { session: CalendarSession }) {
  return (
    <Link
      className="calendar-session calendar-block-tone"
      style={calendarBlockStyle(session.blockId)}
      to={sessionHref(session)}
    >
      <span className="calendar-session__title">
        <strong>{session.name}</strong>
        {session.status && (
          <span
            className={`training-status training-status--${session.status}`}
          >
            {trainingLabels[session.status]}
          </span>
        )}
      </span>
      <small>
        {session.blockName} · Semana {session.weekNumber}
      </small>
      {typeof session.recordedSets === "number" &&
        typeof session.totalSets === "number" && (
          <small>
            {session.recordedSets}/{session.totalSets} series
          </small>
        )}
      <small>
        {session.finished
          ? "Fecha real de ejecución"
          : "Entrenamiento iniciado en esta fecha"}
      </small>
    </Link>
  );
}

export function Calendar({ studentId }: { studentId?: string }) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [baseDate] = useState(() => todayDate());
  const first = new Date(`${baseDate}T12:00:00Z`);
  first.setUTCDate(1);
  first.setUTCMonth(first.getUTCMonth() + offset);
  const month = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
  const query = useCalendar(studentId, month);

  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;

  const data = query.data;
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const leadingBlanks = (first.getUTCDay() + 6) % 7;
  const dates = Array.from(
    { length: count },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
  // Workouts are deliberately separate from prescribed/suggested sessions.
  // The fallback supports rolling deployments without treating a suggestion
  // as if it were an execution date.
  const workouts =
    data.workouts ?? data.sessions.filter((session) => session.actualDate);
  const workoutsOn = (date: string) =>
    workouts.filter((session) => session.actualDate === date);
  const suggestedOn = (date: string) =>
    studentId
      ? data.sessions.filter(
          (session) =>
            !session.actualDate &&
            (session.suggestedDate ?? session.date) === date,
        )
      : [];
  const plannedDates = studentId ? [] : (data.weekPlan?.trainingDates ?? []);
  const milestonesOn = (date: string) =>
    data.competitions?.filter(
      (competition) =>
        competition.eventDate.slice(0, 10) === date &&
        competition.status !== "CANCELLED",
    ) ?? [];
  const activeWeekSessions = data.sessions.filter(
    (session) =>
      session.availability === "AVAILABLE" ||
      session.availability === "IN_PROGRESS",
  );
  const active =
    selected && selected.startsWith(month)
      ? selected
      : dates.includes(data.today)
        ? data.today
        : (dates.find(
            (date) =>
              workoutsOn(date).length ||
              plannedDates.includes(date) ||
              suggestedOn(date).length ||
              milestonesOn(date).length,
          ) ?? dates[0]);
  const dayWorkouts = workoutsOn(active);
  const daySuggestions = suggestedOn(active);
  const dayMilestones = milestonesOn(active);
  const dayPlanned = plannedDates.includes(active) && !dayWorkouts.length;
  const changeMonth = (delta: number) => {
    setOffset(offset + delta);
    setSelected(null);
  };

  return (
    <Card className="month-calendar">
      <div className="month-calendar__header">
        <h2>
          {capitalize(
            first.toLocaleDateString("es-CL", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }),
          )}
        </h2>
        <div className="month-calendar__nav">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => changeMonth(-1)}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => changeMonth(1)}
          >
            →
          </button>
        </div>
      </div>
      {data.competitionsTruncated && (
        <p>
          Se muestran los primeros 200 hitos del mes. Consulta el listado para
          ver todos.
        </p>
      )}
      <div className="month-grid" role="group" aria-label="Días del mes">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            className="month-grid__weekday"
            aria-hidden="true"
          >
            {weekday}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {dates.map((date, index) => {
          const actual = workoutsOn(date);
          const suggestions = suggestedOn(date);
          const milestones = milestonesOn(date);
          const planned = plannedDates.includes(date) && !actual.length;
          const labels = [
            actual.length
              ? `${actual.length} entrenamiento${actual.length === 1 ? " registrado" : "s registrados"}`
              : null,
            planned ? "día planificado" : null,
            suggestions.length
              ? `${suggestions.length} sesión${suggestions.length === 1 ? " sugerida" : "es sugeridas"}`
              : null,
            milestones.length
              ? `${milestones.length} hito${milestones.length === 1 ? "" : "s"}`
              : null,
          ].filter(Boolean);
          const label = `${displayDate(date)}${labels.length ? `, ${labels.join(", ")}` : ""}`;
          return (
            <button
              type="button"
              key={date}
              aria-label={label}
              aria-pressed={date === active}
              onClick={() => setSelected(date)}
              className={`month-grid__day ${date === data.today ? "month-grid__day--today" : ""} ${date === active ? "month-grid__day--selected" : ""}`}
            >
              <span className="month-grid__number">{index + 1}</span>
              <span className="month-grid__marks" aria-hidden="true">
                {actual.slice(0, 3).map((session) => (
                  <span
                    key={session.id}
                    className="month-grid__dot calendar-block-tone"
                    style={calendarBlockStyle(session.blockId)}
                  />
                ))}
                {actual.length > 3 && (
                  <span className="month-grid__more">+{actual.length - 3}</span>
                )}
                {planned && <span className="month-grid__planned" />}
                {suggestions.slice(0, 2).map((session) => (
                  <span
                    key={`suggested-${session.id}`}
                    className="month-grid__suggested calendar-block-tone"
                    style={calendarBlockStyle(session.blockId)}
                  />
                ))}
                {milestones.length > 0 && (
                  <span className="month-grid__milestone">◆</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="calendar-legend" aria-label="Leyenda del calendario">
        <span className="legend-training">● Entrenamiento registrado</span>
        {!studentId && (
          <span className="legend-planned">□ Día planificado</span>
        )}
        {studentId && (
          <span className="legend-suggested">○ Fecha sugerida</span>
        )}
        <span className="legend-competition">◆ Hito</span>
      </div>
      {activeWeekSessions.length > 0 && (
        <section
          className="day-agenda"
          aria-label="Entrenamientos disponibles esta semana"
        >
          <h3>Entrenamientos disponibles esta semana</h3>
          <p className="muted day-agenda__explanation">
            Son flexibles: se mostrarán en una fecha del calendario sólo cuando
            los inicies, o como día planificado sin asignar una sesión ficticia.
          </p>
          {activeWeekSessions.map((session) => (
            <Link
              key={`week-${session.id}`}
              className="calendar-session calendar-block-tone"
              style={calendarBlockStyle(session.blockId)}
              to={sessionHref(session)}
            >
              <strong>{session.name}</strong>
              <small>
                {session.blockName} · Semana {session.weekNumber}
              </small>
              <small>
                {session.availability === "IN_PROGRESS"
                  ? "Continuar entrenamiento"
                  : "Disponible hasta el domingo"}
              </small>
            </Link>
          ))}
        </section>
      )}
      <section
        className="day-agenda"
        aria-live="polite"
        aria-label={`Actividades del ${displayDate(active)}`}
      >
        <h3>
          {capitalize(
            new Date(`${active}T12:00:00Z`).toLocaleDateString("es-CL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }),
          )}
        </h3>
        {!dayWorkouts.length &&
          !daySuggestions.length &&
          !dayMilestones.length &&
          !dayPlanned && <p className="muted">Sin actividades este día.</p>}
        {dayWorkouts.map((session) => (
          <div key={session.id} className="day-agenda__item">
            <CalendarSessionCard session={session} />
          </div>
        ))}
        {dayPlanned && (
          <p className="calendar-planned-day">
            <strong>Día planificado</strong>
            <span>
              Aún no tiene una sesión real asignada. Podrás elegir cualquiera de
              las sesiones disponibles cuando entrenes.
            </span>
          </p>
        )}
        {daySuggestions.map((session) => (
          <div key={`suggestion-${session.id}`} className="day-agenda__item">
            <Link
              className="calendar-session calendar-session--suggested calendar-block-tone"
              style={calendarBlockStyle(session.blockId)}
              to={sessionHref(session)}
            >
              <strong>{session.name}</strong>
              <small>
                {session.blockName} · Semana {session.weekNumber}
              </small>
              <small>Fecha sugerida; no es una ejecución registrada</small>
              {session.rescheduled && <small>Sugerencia modificada</small>}
            </Link>
            <RescheduleSession session={session} />
          </div>
        ))}
        {dayMilestones.map((competition) => (
          <p className="calendar-competition" key={competition.id}>
            <span aria-hidden="true">◆ </span>
            <strong>Hito</strong>
            <span>{competition.name}</span>
          </p>
        ))}
      </section>
      {data.assignments.some((assignment) => !assignment.startDate) && (
        <p>
          Hay asignaciones sin fecha de inicio. La navegación manual sigue
          disponible.
        </p>
      )}
      {data.sessions.some(
        (session) =>
          !session.actualDate && !session.suggestedDate && !session.date,
      ) && (
        <p>
          Las sesiones sin fecha sugerida siguen disponibles desde el resumen de
          su semana.
        </p>
      )}
    </Card>
  );
}
