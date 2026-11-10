import { todayDate } from '../../lib/calendarDate';
import { trainingLabels } from '../../api/training';
import { RescheduleSession } from './RescheduleSession';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCalendar, useCoachingMutation, useProfile, displayDate, type Competition, type CalendarSession } from '../../api/coaching';
import { Card, ErrorState, Skeleton } from '../ui/Primitives';

export function SessionContext({ session }: { session: CalendarSession }) {
  const suggestedDate = session.suggestedDate ?? session.date;
  return <><h3>{session.name}</h3><p>{session.programName} · {session.blockName} · Semana {session.weekNumber}</p>
    {session.actualDate ? <p>{session.finished ? 'Realizado' : 'Iniciado'}: {displayDate(session.actualDate)}</p> : <p>Fecha sugerida: {suggestedDate && displayDate(suggestedDate)}</p>}
    {session.rescheduled && <p>Sugerencia modificada · Original: {session.originalDate && displayDate(session.originalDate)}</p>}</>;
}
export function NextCompetition({ competition, today }: { competition: Competition | null; today: string }) {
  return <Card><p className="eyebrow">Próximo hito</p>{competition ? <>
    <h2>{competition.name}</h2><p>{displayDate(competition.eventDate)} · {competition.category}</p>
    <p>{Math.round((Date.parse(competition.eventDate.slice(0, 10)) - Date.parse(today)) / 86400000)} días restantes</p>
    {competition.goal && <p>{competition.goal}</p>}{competition.coachGoal && <p><strong>Tu coach:</strong> {competition.coachGoal}</p>}
  </> : <p>No tienes hitos próximos.</p>}<Link to="/competitions">{competition ? 'Ver hitos' : 'Agregar hito'}</Link></Card>;
}
export function MyCoach() {
  const query = useProfile();
  return <Card><h2>Mi Coach</h2>{query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}
    {query.data?.coach ? <><p>{query.data.coach.name}</p><p>{query.data.coach.email}</p><Link to={`/messages?peer=${query.data.coach.id}`}>Enviar mensaje</Link></> : query.isSuccess && <p>Sin coach asociado.</p>}</Card>;
}
export function AssignmentDate({ id, startDate }: { id: string; startDate?: string | null }) {
  const [value, setValue] = useState(startDate?.slice(0, 10) ?? '');
  const mutation = useCoachingMutation();
  return <form className="date-editor" onSubmit={(e) => { e.preventDefault(); mutation.mutate({ path: `/program-assignments/${id}/start-date`, data: { startDate: value } }); }}>
    {!startDate && <p className="muted">Esta asignación no tiene fecha de inicio configurada.</p>}
    <label className="field">Fecha de inicio<input type="date" required value={value} onChange={(e) => setValue(e.target.value)} /></label>
    <button disabled={mutation.isPending}>Guardar fecha</button>{mutation.isError && <ErrorState message={mutation.error.message} />}{mutation.isSuccess && <p role="status">Fecha guardada.</p>}
  </form>;
}
const WEEKDAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const sessionCalendarDate = (session: CalendarSession) => session.actualDate ?? session.suggestedDate ?? session.date;
// Mayúscula solo en la primera letra ("Noviembre de 2026", no "Noviembre De 2026").
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es-CL') + text.slice(1);
// Calendario mensual compacto (estilo Google Calendar): una grilla de 7
// columnas con indicadores por día y, debajo, el detalle del día elegido.
export function Calendar({ studentId }: { studentId?: string }) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [baseDate] = useState(() => todayDate());
  const first = new Date(`${baseDate}T12:00:00Z`); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() + offset);
  const month = first.getUTCFullYear() + '-' + String(first.getUTCMonth() + 1).padStart(2, '0');
  const query = useCalendar(studentId, month);
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const d = query.data;

  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const leadingBlanks = (first.getUTCDay() + 6) % 7; // la semana empieza el lunes
  const dates = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const sessionsOn = (date: string) => d.sessions.filter((s) => sessionCalendarDate(s) === date);
  const activeWeekSessions = d.sessions.filter((s) => s.availability === 'AVAILABLE' || s.availability === 'IN_PROGRESS');
  const milestonesOn = (date: string) => d.competitions?.filter((c) => c.eventDate.slice(0, 10) === date && c.status !== 'CANCELLED') ?? [];
  // Día elegido: el que tocó el usuario; si no, hoy (si está en el mes), el
  // primer día con actividad o el día 1.
  const active = selected && selected.startsWith(month) ? selected
    : dates.includes(d.today) ? d.today
    : dates.find((date) => sessionsOn(date).length || milestonesOn(date).length) ?? dates[0];
  const daySessions = sessionsOn(active);
  const dayMilestones = milestonesOn(active);
  const changeMonth = (delta: number) => { setOffset(offset + delta); setSelected(null); };

  return <Card className="month-calendar"><div className="month-calendar__header"><h2>{capitalize(first.toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</h2><div className="month-calendar__nav"><button type="button" aria-label="Mes anterior" onClick={() => changeMonth(-1)}>←</button><button type="button" aria-label="Mes siguiente" onClick={() => changeMonth(1)}>→</button></div></div>
    {d.competitionsTruncated && <p>Se muestran los primeros 200 hitos del mes. Consulta el listado para ver todos.</p>}
    <div className="month-grid" role="group" aria-label="Días del mes">
      {WEEKDAYS.map((w) => <span key={w} className="month-grid__weekday" aria-hidden="true">{w}</span>)}
      {Array.from({ length: leadingBlanks }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
      {dates.map((date, i) => {
        const sessions = sessionsOn(date);
        const milestones = milestonesOn(date);
        const label = `${displayDate(date)}${sessions.length ? `, ${sessions.length} entrenamiento${sessions.length > 1 ? 's' : ''}` : ''}${milestones.length ? `, ${milestones.length} hito${milestones.length > 1 ? 's' : ''}` : ''}`;
        return <button type="button" key={date} aria-label={label} aria-pressed={date === active} onClick={() => setSelected(date)}
          className={`month-grid__day ${date === d.today ? 'month-grid__day--today' : ''} ${date === active ? 'month-grid__day--selected' : ''}`}>
          <span className="month-grid__number">{i + 1}</span>
          <span className="month-grid__marks" aria-hidden="true">
            {sessions.slice(0, 3).map((s) => <span key={s.id} className={`month-grid__dot block-dot-${s.blockIndex % 3} ${s.completed ? 'month-grid__dot--done' : ''}`} />)}
            {milestones.length > 0 && <span className="month-grid__milestone">◆</span>}
          </span>
        </button>;
      })}
    </div>
    <div className="calendar-legend" aria-label="Leyenda del calendario"><span className="legend-training">● Sugerido</span><span className="legend-competition">◆ Hito</span><span>○ Realizado</span></div>
    {activeWeekSessions.length > 0 && <section className="day-agenda" aria-label="Entrenamientos disponibles esta semana">
      <h3>Entrenamientos disponibles esta semana</h3>
      {activeWeekSessions.map((s) => <Link key={`week-${s.id}`} className={`calendar-session block-color-${s.blockIndex % 3}`} to={`/training/sessions/${s.sessionId}?assignmentId=${s.assignmentId}`}>
        {s.name}<small>{s.blockName} · Semana {s.weekNumber}</small><small>{s.availability === 'IN_PROGRESS' ? 'Continuar entrenamiento' : 'Disponible hasta el domingo'}</small>
      </Link>)}
    </section>}
    <section className="day-agenda" aria-live="polite" aria-label={`Actividades del ${displayDate(active)}`}>
      <h3>{capitalize(new Date(`${active}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))}</h3>
      {!daySessions.length && !dayMilestones.length && <p className="muted">Sin actividades este día.</p>}
      {daySessions.map((s) => <div key={s.id} className="day-agenda__item"><Link className={`calendar-session block-color-${s.blockIndex % 3}`} to={`/training/sessions/${s.sessionId}?assignmentId=${s.assignmentId}`}>
        {s.actualDate ? '✓ ' : '● '}{s.name}{s.status && <small>{trainingLabels[s.status]}</small>}<small>{s.blockName} · Semana {s.weekNumber}</small>
        <small>{s.actualDate ? (s.finished ? 'Fecha real de ejecución' : 'Fecha real de inicio') : 'Fecha sugerida; no limita la ejecución'}</small>
        {s.rescheduled && <small title={`Original: ${s.originalDate && displayDate(s.originalDate)} · Sugerida: ${(s.suggestedDate ?? s.date) && displayDate((s.suggestedDate ?? s.date)!)}`}>Sugerencia modificada</small>}
      </Link>{studentId && !s.actualDate && <RescheduleSession session={s} />}</div>)}
      {dayMilestones.map((c) => <p className="calendar-competition" key={c.id}><span aria-hidden="true">◆ </span><strong>Hito</strong><span>{c.name}</span></p>)}
    </section>
    {d.assignments.some((a) => !a.startDate) && <p>Hay asignaciones sin fecha de inicio. La navegación manual sigue disponible.</p>}
    {d.sessions.some((s) => !sessionCalendarDate(s)) && <p>Las sesiones sin fecha sugerida siguen disponibles desde el resumen de su semana.</p>}
  </Card>;
}
