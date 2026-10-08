import { Icon } from '../ui/Icon';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useCoachingQuery, useCoachingMutation, type Notice } from '../../api/coaching';
import { ErrorState, Skeleton } from '../ui/Primitives';

function relativeTime(value: string) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  const format = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  return Math.abs(minutes) < 60 ? format.format(minutes, 'minute') : Math.abs(minutes) < 1440 ? format.format(Math.round(minutes / 60), 'hour') : format.format(Math.round(minutes / 1440), 'day');
}

function NoticeLink({ notice, onRead }: { notice: Notice; onRead: () => void }) {
  const { user } = useAuth();
  const id = encodeURIComponent(notice.resourceId ?? '');
  const url = notice.resourceType === 'message' ? `/messages?peer=${id}`
    : notice.resourceType === 'program' ? `/student/programs/${id}`
    : notice.resourceType === 'student' ? `/students/${id}`
    : notice.resourceType === 'competition' ? user?.role === 'COACH' ? '/dashboard' : '/competitions' : '/home';
  return <Link onClick={onRead} to={url}>{notice.title}</Link>;
}
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const count = useCoachingQuery<{ count: number }>('/notifications/unread-count', true, 45000);
  const query = useCoachingQuery<Notice[]>(`/notifications?page=${page}`, open, 45000);
  const mutation = useCoachingMutation();
  return <div className="notice-container"><button aria-label={`Notificaciones${count.data?.count ? `: ${count.data.count} sin leer` : ''}`} aria-expanded={open} aria-controls="notice-panel" onClick={() => setOpen(!open)}><Icon name="bell" /><span>Notificaciones</span>{!!count.data?.count && <strong className="notice-badge">{count.data.count}</strong>}</button>
    {open && <section id="notice-panel" className="notice-panel" aria-label="Notificaciones"><div className="dialog-actions"><h2>Notificaciones</h2><button onClick={() => setOpen(false)} aria-label="Cerrar notificaciones">×</button></div>
      <button disabled={mutation.isPending} onClick={() => mutation.mutate({ path: '/notifications/read-all' })}>Marcar todas como leídas</button>
      {query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}{mutation.isError && <ErrorState message={mutation.error.message} />}
      {query.data?.length === 0 && <p>Sin notificaciones.</p>}
      <ul className="nested-list">{query.data?.map((n) => <li key={n.id} className={!n.readAt ? 'notice-unread' : ''}>
        <NoticeLink notice={n} onRead={() => { mutation.mutate({ path: `/notifications/${n.id}/read` }); setOpen(false); }} />
        {n.body !== n.title && <p>{n.body}</p>}<small><time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString('es-CL')}>{relativeTime(n.createdAt)}</time> · {n.readAt ? 'Leída' : 'Sin leer'}</small>
      </li>)}</ul>
      <div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><button disabled={(query.data?.length ?? 0) < 20} onClick={() => setPage(page + 1)}>Siguiente</button></div>
    </section>}
  </div>;
}
