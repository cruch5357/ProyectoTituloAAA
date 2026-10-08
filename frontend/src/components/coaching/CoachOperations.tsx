import { Link } from 'react-router-dom';
import { useCoachingQuery, displayDate, type Competition, type Notice } from '../../api/coaching';
import { Card, ErrorState, Skeleton } from '../ui/Primitives';
export function CoachOperations() {
  const query = useCoachingQuery<{ competitions: Competition[]; attention: { id: string; name: string; reasons: string[] }[]; workoutsThisWeek: number; assignedActivity?: { id: string; title: string; createdAt: string }[] }>('/dashboard/operations');
  const activity = useCoachingQuery<Notice[]>('/notifications?page=1');
  return <div className="operations-grid">{query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}
    {query.data && <><Card><h2>Requieren atención</h2><p>{query.data.workoutsThisWeek} entrenamientos registrados en los últimos 7 días</p>{!query.data.attention.length && <p>Sin necesidades de planificación detectadas.</p>}<ul className="nested-list">{query.data.attention.map((s) => <li key={s.id}><Link to={`/students/${s.id}`}>{s.name}</Link><p>{s.reasons.join(' · ')}</p></li>)}</ul></Card>
      <Card><h2>Próximas competiciones</h2>{!query.data.competitions.length && <p>Sin competiciones próximas.</p>}<ul className="nested-list">{query.data.competitions.map((c) => <li key={c.id}><Link to={`/students/${c.studentId}?tab=calendar`}>{c.student?.name} · {c.name}</Link><p>{displayDate(c.eventDate)} · {c.category}</p></li>)}</ul></Card></>}
    <Card><h2>Novedades</h2>{activity.isError && <ErrorState retry={() => void activity.refetch()} />}{activity.isLoading && <Skeleton />}<ul className="nested-list">{[...(activity.data ?? []), ...(query.data?.assignedActivity ?? [])].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,20).map((n) => <li key={n.id}>{n.title}<small>{new Date(n.createdAt).toLocaleString('es-CL')}</small></li>)}</ul>{activity.data?.length === 0 && !query.data?.assignedActivity?.length && <p>Sin novedades.</p>}</Card>
  </div>;
}
