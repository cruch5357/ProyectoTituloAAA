import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { usePrograms, useUpdateProgramStatus } from '../../api/programs';
import { ApiError } from '../../lib/apiClient';
import { ProgramStatusBadge } from './ProgramStatusBadge';
import { ProgramFormDialog } from './ProgramFormDialog';

const PAGE_SIZE = 20;

// Pantalla "Mis programas" del Coach (PROMPT 08). Mismo patrón estructural
// exacto que ExercisesListPage.tsx (PROMPT 07): toda la data viene de
// TanStack Query, sin estado de servidor duplicado. El coachId nunca
// aparece acá — lo resuelve el backend a partir del token.
export function ProgramsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const programsQuery = usePrograms({ page, limit: PAGE_SIZE, search });
  const updateStatusMutation = useUpdateProgramStatus();

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleToggleStatus(id: string, currentIsActive: boolean) {
    updateStatusMutation.mutate({ id, isActive: !currentIsActive });
  }

  return (
    <section>
      <div className="page-header">
        <h1>Mis programas</h1>
        <ProgramFormDialog />
      </div>

      <form onSubmit={handleSearchSubmit} className="search-form">
        <label className="field">
          <span>Buscar por nombre</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Ej: Fuerza, Hipertrofia"
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {programsQuery.isLoading && <p>Cargando programas…</p>}

      {programsQuery.isError && (
        <p role="alert" className="field-error">
          {programsQuery.error instanceof ApiError
            ? programsQuery.error.message
            : 'No se pudieron cargar los programas.'}
        </p>
      )}

      {programsQuery.isSuccess && programsQuery.data.items.length === 0 && (
        <p>
          Todavía no tienes programas
          {search ? ' que coincidan con la búsqueda' : ''}. Usa &quot;Nuevo
          programa&quot; para crear el primero.
        </p>
      )}

      {programsQuery.isSuccess && programsQuery.data.items.length > 0 && (
        <>
          <table className="students-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Duración</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {programsQuery.data.items.map((program) => (
                <tr key={program.id}>
                  <td>
                    <Link to={`/programs/${program.id}`}>{program.name}</Link>
                  </td>
                  <td>
                    {program.durationWeeks
                      ? `${program.durationWeeks} semanas`
                      : '—'}
                  </td>
                  <td>
                    <ProgramStatusBadge isActive={program.isActive} />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleStatus(program.id, program.isActive)
                      }
                      disabled={
                        updateStatusMutation.isPending &&
                        updateStatusMutation.variables?.id === program.id
                      }
                    >
                      {program.isActive ? 'Archivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav className="pagination" aria-label="Paginación de programas">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <span>
              Página {programsQuery.data.meta.page} de{' '}
              {programsQuery.data.meta.totalPages} (
              {programsQuery.data.meta.total} programas)
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(programsQuery.data.meta.totalPages, current + 1),
                )
              }
              disabled={page >= programsQuery.data.meta.totalPages}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}

      {updateStatusMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo actualizar el estado del programa.
        </p>
      )}
    </section>
  );
}
