import { readableDate } from '../../lib/readableDate';
import { Link } from 'react-router-dom';
import { useCoachingQuery, displayDate, type Competition, type Notice } from '../../api/coaching';
import { Card, ErrorState, Skeleton } from '../ui/Primitives';
import { CompetitionTypeBadge } from './CompetitionTypeBadge';
// Solo las más recientes: el historial completo está en Notificaciones.
const NEWS_LIMIT = 4;
// Igual que Novedades: el resto de los alumnos se revisa en Mis alumnos.
const ATTENTION_LIMIT = 3;
export function CoachOperations() {
  const query = useCoachingQuery<{ competitions: Competition[]; attention: { id: string; name: string; reasons: string[] }[]; workoutsThisWeek: number; assignedActivity?: { id: string; title: string; createdAt: string }[] }>('/dashboard/operations');
  const activity = useCoachingQuery<Notice[]>('/notifications?page=1');
  const news = [...(activity.data ?? []), ...(query.data?.assignedActivity ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="operations-grid">{query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}
    {query.data && <><Card><h2>Requieren atención</h2><p>{query.data.workoutsThisWeek} entrenamientos registrados en los últimos 7 días</p>{!query.data.attention.length && <p>Sin necesidades de planificación detectadas.</p>}<ul className="nested-list">{query.data.attention.slice(0, ATTENTION_LIMIT).map((s) => <li key={s.id}><Link to={`/students/${s.id}`}>{s.name}</Link><p>{s.reasons.join(' · ')}</p></li>)}</ul>{query.data.attention.length > ATTENTION_LIMIT && <p className="muted operations-more">Ves {ATTENTION_LIMIT} de {query.data.attention.length} alumnos. El resto está en <Link to="/students">Mis alumnos</Link>.</p>}</Card>
      <Card><h2>Próximos hitos</h2>{!query.data.competitions.length && <p>Sin hitos próximos.</p>}<ul className="nested-list">{query.data.competitions.map((c) => <li key={c.id}><Link to={`/students/${c.studentId}?tab=calendar`}>{c.student?.name} · {c.name}</Link><p><CompetitionTypeBadge type={c.type} /> · {displayDate(c.eventDate)} · {c.category}</p></li>)}</ul></Card></>}
    <Card><h2>Novedades</h2>{activity.isError && <ErrorState retry={() => void activity.refetch()} />}{activity.isLoading && <Skeleton />}<ul className="nested-list">{news.slice(0, NEWS_LIMIT).map((n) => <li key={n.id}>{n.title}<small>{readableDate(n.createdAt)}</small></li>)}</ul>{activity.data?.length === 0 && !query.data?.assignedActivity?.length && <p>Sin novedades.</p>}{news.length > NEWS_LIMIT && <p className="muted operations-more">Ves las {NEWS_LIMIT} más recientes. El resto está en Notificaciones.</p>}</Card>
  </div>;
}
