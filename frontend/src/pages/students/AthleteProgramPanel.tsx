import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrograms } from '../../api/programs';
import { useProgramAssignments } from '../../api/programAssignments';
import { ProgramBoard } from '../../components/program/ProgramBoard';
import { Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/Primitives';
import { AssignmentStatusBadge } from '../programs/AssignmentStatusBadge';

// The API lists assignments by program, not by athlete. Only fetch the
// explicitly selected program, avoiding a scan of every program (N+1).
export function AthleteProgramPanel({ studentId }: { studentId: string }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [programId, setProgramId] = useState('');
  const programs = usePrograms({ page, limit: 20, search });
  const assignments = useProgramAssignments(programId || undefined);
  const ownAssignments = assignments.data?.filter(a => a.studentId === studentId) ?? [];
  return <><Card><h2>Programa del atleta</h2><p className="muted">Selecciona un programa para consultar su asignación a este alumno.</p>
    <label className="field">Buscar programa<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); setProgramId(''); }} /></label>
    {programs.isLoading && <Skeleton />}{programs.isError && <ErrorState retry={() => void programs.refetch()} />}
    {programs.data && <><label className="field">Programa<select value={programId} onChange={e => setProgramId(e.target.value)}><option value="">Selecciona un programa…</option>{programs.data.items.map(p => <option key={p.id} value={p.id}>{p.name}{!p.isActive ? ' (archivado)' : ''}</option>)}</select></label>
      {programs.data.meta.totalPages > 1 && <nav className="pagination" aria-label="Páginas de programas"><button type="button" disabled={page === 1} onClick={() => { setPage(page - 1); setProgramId(''); }}>Anterior</button><span>{page} / {programs.data.meta.totalPages}</span><button type="button" disabled={page >= programs.data.meta.totalPages} onClick={() => { setPage(page + 1); setProgramId(''); }}>Siguiente</button></nav>}
    </>}
    <Link className="button" to="/programs">Ver programas y asignaciones</Link>
  </Card>
  {programId && <>{assignments.isLoading && <Skeleton label="Consultando asignaciones…" />}{assignments.isError && <ErrorState retry={() => void assignments.refetch()} />}
    {assignments.isSuccess && (ownAssignments.length ? <><Card><h2>Asignación confirmada</h2>{ownAssignments.map(a => <p key={a.id}><AssignmentStatusBadge status={a.status} /> · Asignado el {new Date(a.assignedAt).toLocaleDateString()}</p>)}<Link to={`/programs/${programId}`}>Gestionar programa y asignación →</Link></Card><ProgramBoard programId={programId} /></> : <Card><EmptyState title="Este programa no está asignado al alumno" description="Puedes gestionar la asignación desde el programa." action={<Link className="button" to={`/programs/${programId}`}>Gestionar asignación</Link>} /></Card>)}
  </>}
  </>;
}
