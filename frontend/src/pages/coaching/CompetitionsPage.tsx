import { useState, type FormEvent } from 'react';
import { useCoachingMutation, useCoachingQuery, displayDate, type Competition } from '../../api/coaching';
import { Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/Primitives';

export function CompetitionsPage({ studentId }: { studentId?: string }) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Competition | null | undefined>();
  const query = useCoachingQuery<Competition[]>(studentId ? `/students/${studentId}/competitions?page=${page}` : `/competitions/me?page=${page}`);
  return <section><div className="page-header"><h2>Competiciones</h2>{!studentId && <button onClick={() => setEditing(null)}>Agregar competición</button>}</div>
    {query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}
    {query.data?.length === 0 && <EmptyState title="Sin competiciones" />}
    {editing !== undefined && <CompetitionForm key={editing?.id ?? 'new'} competition={editing} close={() => setEditing(undefined)} />}
    {query.data?.map((c) => <Card key={c.id}><h3>{c.name}</h3><p>{displayDate(c.eventDate)} · {c.category} · {({ UPCOMING: 'Próxima', COMPLETED: 'Completada', CANCELLED: 'Cancelada' })[c.status]}</p>
      {c.location && <p>{c.location}</p>}{c.goal && <p><strong>Objetivo:</strong> {c.goal}</p>}{c.notes && <p>{c.notes}</p>}
      {studentId ? <CoachGoal competition={c} /> : <><p><strong>Indicaciones del coach:</strong> {c.coachGoal || 'Sin indicaciones todavía.'}</p><button onClick={() => setEditing(c)}>Editar competición</button></>}
    </Card>)}
    <nav className="pagination" aria-label="Paginación de competiciones"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page}</span><button disabled={(query.data?.length ?? 0) < 20} onClick={() => setPage(page + 1)}>Siguiente</button></nav>
  </section>;
}
function CompetitionForm({ competition: c, close }: { competition: Competition | null; close: () => void }) {
  const mutation = useCoachingMutation();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    mutation.mutate({ path: c ? `/competitions/${c.id}` : '/competitions', data, method: c ? 'patch' : 'post' }, { onSuccess: close });
  }
  return <Card><h3>{c ? 'Editar competición' : 'Nueva competición'}</h3><form className="coaching-form" onSubmit={submit}>
    <label className="field">Nombre<input name="name" required minLength={2} maxLength={160} defaultValue={c?.name} /></label>
    <label className="field">Fecha<input name="eventDate" type="date" required defaultValue={c?.eventDate.slice(0, 10)} /></label>
    <label className="field">Categoría<input name="category" required maxLength={100} defaultValue={c?.category} /></label>
    <label className="field">Ubicación<input name="location" maxLength={200} defaultValue={c?.location ?? ''} /></label>
    <label className="field">Objetivo del alumno<textarea name="goal" maxLength={2000} defaultValue={c?.goal ?? ''} /></label>
    <label className="field">Notas<textarea name="notes" maxLength={2000} defaultValue={c?.notes ?? ''} /></label>
    <label className="field">Estado<select name="status" defaultValue={c?.status ?? 'UPCOMING'}><option value="UPCOMING">Próxima</option><option value="COMPLETED">Completada</option><option value="CANCELLED">Cancelada</option></select></label>
    <div className="dialog-actions"><button disabled={mutation.isPending}>Guardar competición</button><button type="button" onClick={close}>Cancelar edición</button></div>
    {mutation.isError && <ErrorState message={mutation.error.message} />}
  </form></Card>;
}
function CoachGoal({ competition }: { competition: Competition }) {
  const mutation = useCoachingMutation();
  return <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ path: `/competitions/${competition.id}/coach-goal`, data: { coachGoal: new FormData(e.currentTarget).get('coachGoal') } }); }}>
    <label className="field">Objetivo / indicaciones del coach<textarea name="coachGoal" maxLength={2000} defaultValue={competition.coachGoal ?? ''} /></label>
    <button disabled={mutation.isPending}>Guardar indicaciones</button>{mutation.isError && <ErrorState message={mutation.error.message} />}{mutation.isSuccess && <p role="status">Indicaciones guardadas.</p>}
  </form>;
}
