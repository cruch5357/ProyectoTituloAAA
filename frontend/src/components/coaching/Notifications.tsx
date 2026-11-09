import { readableDate } from '../../lib/readableDate';
import { Icon } from '../ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useCoachingQuery, useCoachingMutation, type Notice } from '../../api/coaching';
import { ErrorState, Skeleton } from '../ui/Primitives';

function NoticeLink({ notice, onRead }: { notice: Notice; onRead: () => void }) {
  const { user } = useAuth();
  const id = encodeURIComponent(notice.resourceId ?? '');
  const url = notice.resourceType === 'message' ? `/messages?peer=${id}`
    : notice.resourceType === 'program' ? `/student/programs/${id}`
    : notice.resourceType === 'student' ? `/students/${id}`
    : notice.resourceType === 'competition' ? user?.role === 'COACH' ? '/dashboard' : '/competitions' : '/home';
  return <Link onClick={onRead} to={url}>{notice.title}</Link>;
}
function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = useCoachingQuery<{ count: number }>('/notifications/unread-count', true, 45000);
  const query = useCoachingQuery<Notice[]>(`/notifications?page=${page}`, open, 45000);
  const mutation = useCoachingMutation();
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  return <div className="notice-container" ref={containerRef}><button type="button" aria-label={`Notificaciones${count.data?.count ? `: ${count.data.count} sin leer` : ''}`} aria-expanded={open} aria-controls="notice-panel" onClick={() => setOpen((current) => !current)}><Icon name="bell" /><span>Notificaciones</span>{!!count.data?.count && <strong className="notice-badge">{count.data.count}</strong>}</button>
    {open && <section id="notice-panel" className="notice-panel" aria-label="Notificaciones"><header className="notice-panel__header"><h2>Notificaciones</h2><button type="button" className="notice-panel__close" onClick={() => setOpen(false)} aria-label="Cerrar notificaciones">×</button></header>
      <div className="notice-panel__content">
        <button type="button" className="notice-panel__read-all button--secondary" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: '/notifications/read-all' })}>Marcar todas como leídas</button>
        {query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}{mutation.isError && <ErrorState message={mutation.error.message} />}
        {query.data?.length === 0 && <p className="notice-panel__empty">Sin notificaciones.</p>}
        <ul className="notice-list">{query.data?.map((n) => <li key={n.id} className={!n.readAt ? 'notice-unread' : 'notice-read'}>
          <NoticeLink notice={n} onRead={() => { mutation.mutate({ path: `/notifications/${n.id}/read` }); setOpen(false); }} />
          {n.body !== n.title && <p>{n.body}</p>}<small><time dateTime={n.createdAt} title={new Date(n.createdAt).toISOString()}>{readableDate(n.createdAt)}</time> · {n.readAt ? 'Leída' : 'Sin leer'}</small>
        </li>)}</ul>
      </div>
      <footer className="notice-panel__pagination"><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><button type="button" disabled={(query.data?.length ?? 0) < 20} onClick={() => setPage((current) => current + 1)}>Siguiente</button></footer>
    </section>}
  </div>;
}

export function NotificationBell() {
  const location = useLocation();
  const route = `${location.key}:${location.pathname}${location.search}${location.hash}`;
  return <NotificationPopover key={route} />;
}
