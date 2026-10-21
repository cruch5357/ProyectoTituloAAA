import { todayDate } from '../../lib/calendarDate';
import { trainingLabels } from '../../api/training';
import { RescheduleSession } from './RescheduleSession';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCalendar, useCoachingMutation, useProfile, displayDate, type Competition, type CalendarSession } from '../../api/coaching';
import { Card, ErrorState, Skeleton } from '../ui/Primitives';

export function SessionContext({ session }: { session: CalendarSession }) {
  return <><h3>{session.name}</h3><p>{session.programName} · {session.blockName} · Semana {session.weekNumber}</p><p>{session.date && displayDate(session.date)}</p>{session.rescheduled && <p>Reprogramada · Original: {session.originalDate && displayDate(session.originalDate)}</p>}</>;
}
export function NextCompetition({ competition, today }: { competition: Competition | null; today: string }) {
  return <Card><p className="eyebrow">Próxima competición</p>{competition ? <>
    <h2>{competition.name}</h2><p>{displayDate(competition.eventDate)} · {competition.category}</p>
    <p>{Math.round((Date.parse(competition.eventDate.slice(0, 10)) - Date.parse(today)) / 86400000)} días restantes</p>
    {competition.goal && <p>{competition.goal}</p>}{competition.coachGoal && <p><strong>Tu coach:</strong> {competition.coachGoal}</p>}
  </> : <p>No tienes competiciones próximas.</p>}<Link to="/competitions">{competition ? 'Ver competiciones' : 'Agregar competición'}</Link></Card>;
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
export function Calendar({ studentId }: { studentId?: string }) {
  const [offset, setOffset] = useState(0);
  const [baseDate] = useState(() => todayDate());
  const first = new Date(`${baseDate}T12:00:00Z`); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() + offset);
  const month = first.getUTCFullYear() + '-' + String(first.getUTCMonth() + 1).padStart(2, '0');
  const query = useCalendar(studentId, month);
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const d = query.data;

  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return <Card><div className="page-header"><h2>Calendario</h2><div className="dialog-actions"><button aria-label="Mes anterior" onClick={() => setOffset(offset - 1)}>←</button><strong>{first.toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button aria-label="Mes siguiente" onClick={() => setOffset(offset + 1)}>→</button></div></div>
    <div className="calendar-legend" aria-label="Leyenda del calendario"><span className="legend-training">● Entrenamiento · color del bloque</span><span className="legend-competition">◆ Competición · borde y distintivo</span><span>✓ Finalizada</span></div>
    {d.competitionsTruncated && <p>Se muestran las primeras 200 competiciones del mes. Consulta el listado para ver todas.</p>}
    <div className="calendar-grid">{Array.from({ length: count }, (_, i) => {
      const date = `${first.toISOString().slice(0, 7)}-${String(i + 1).padStart(2, '0')}`;
      const sessions = d.sessions.filter((s) => s.date === date);
      const competitions = d.competitions?.filter((c) => c.eventDate.slice(0, 10) === date && c.status !== 'CANCELLED') ?? [];
      return <section key={date} aria-label={`${displayDate(date)}${sessions.length ? ', entrenamiento' : ''}${competitions.length ? ', competición' : ''}`} className={`calendar-day ${sessions.length ? `calendar-day--training calendar-block-${sessions[0].blockIndex % 3}` : ''} ${competitions.length ? 'calendar-day--competition' : ''} ${date === d.today ? 'calendar-day--today' : ''}`}><time dateTime={date}>{i + 1} · {new Date(`${date}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'UTC' })}</time>
        {sessions.map((s) => <div key={s.id}><Link className={`calendar-session block-color-${s.blockIndex % 3}`} to={`/training/sessions/${s.sessionId}?assignmentId=${s.assignmentId}`}>{s.completed ? '✓ ' : '● '}{s.name}{s.status && <small>{trainingLabels[s.status]}</small>}<small>{s.blockName} · Semana {s.weekNumber}</small>{s.rescheduled && <small title={`Original: ${s.originalDate && displayDate(s.originalDate)} · Nueva: ${s.date && displayDate(s.date)}`}>Reprogramada</small>}</Link>{studentId && <RescheduleSession session={s} />}</div>)}
        {competitions.map((c) => <p className="calendar-competition" key={c.id}><span aria-hidden="true">◆ </span><strong>Competición</strong><span>{c.name}</span></p>)}
      </section>;
    })}</div>
    {d.assignments.some((a) => !a.startDate) && <p>Hay asignaciones sin fecha de inicio. La navegación manual sigue disponible.</p>}
    {d.sessions.some((s) => !s.date) && <p>Las sesiones sin día de semana o fecha de inicio no se ubican en el calendario.</p>}
  </Card>;
}
