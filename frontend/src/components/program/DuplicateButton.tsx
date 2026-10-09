import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';

export function DuplicateButton({ kind, id }: { kind: 'programs' | 'weeks' | 'sessions'; id: string }) {
  const client = useQueryClient();
  const label = { programs: 'programa', weeks: 'semana', sessions: 'sesión' }[kind];
  const success = { programs: 'Programa duplicado', weeks: 'Semana duplicada', sessions: 'Sesión duplicada' }[kind];
  const mutation = useMutation({
    mutationFn: async () => (await apiClient.post<{ id: string }>(`/${kind}/${id}/duplicate`, {})).data,
    onSuccess: async () => {
      await Promise.all([kind, 'coaching', 'studentTraining'].map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
  });
  return <div>
    <button type="button" className="button button--secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? 'Duplicando...' : `Duplicar ${label}`}
    </button>
    {mutation.isSuccess && <p role="status">{success}. <Link to={`/${kind}/${mutation.data.id}`}>Abrir copia</Link>{kind === 'sessions' && ' · Conserva el mismo día; puedes editarlo en la copia.'}</p>}
    {mutation.isError && <p role="alert">{mutation.error.message}</p>}
  </div>;
}
