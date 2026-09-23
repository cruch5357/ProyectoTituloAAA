import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useExercises, useUpdateExerciseStatus } from '../../api/exercises';
import { ApiError } from '../../lib/apiClient';
import { ExerciseStatusBadge } from './ExerciseStatusBadge';
import { ExerciseFormDialog } from './ExerciseFormDialog';

const PAGE_SIZE = 20;

// Pantalla "Catálogo de ejercicios" del Coach (PROMPT 07). Mismo patrón
// estructural exacto que StudentsListPage.tsx (PROMPT 04): toda la data
// viene de TanStack Query (useExercises), sin estado de servidor duplicado.
// El coachId que filtra el catálogo nunca aparece acá — lo resuelve el
// backend a partir del token (ver ExercisesController).
export function ExercisesListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const exercisesQuery = useExercises({ page, limit: PAGE_SIZE, search });
  const updateStatusMutation = useUpdateExerciseStatus();

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
        <h1>Catálogo de ejercicios</h1>
        <ExerciseFormDialog />
      </div>

      <form onSubmit={handleSearchSubmit} className="search-form">
        <label className="field">
          <span>Buscar por nombre o grupo muscular</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Ej: Sentadilla, Piernas"
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {exercisesQuery.isLoading && <p>Cargando ejercicios…</p>}

      {exercisesQuery.isError && (
        <p role="alert" className="field-error">
          {exercisesQuery.error instanceof ApiError
            ? exercisesQuery.error.message
            : 'No se pudo cargar el catálogo de ejercicios.'}
        </p>
      )}

      {exercisesQuery.isSuccess && exercisesQuery.data.items.length === 0 && (
        <p>
          Todavía no tienes ejercicios
          {search ? ' que coincidan con la búsqueda' : ''}. Usa &quot;Nuevo
          ejercicio&quot; para agregar el primero.
        </p>
      )}

      {exercisesQuery.isSuccess && exercisesQuery.data.items.length > 0 && (
        <>
          <table className="students-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Grupo muscular</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {exercisesQuery.data.items.map((exercise) => (
                <tr key={exercise.id}>
                  <td>
                    <Link to={`/exercises/${exercise.id}`}>
                      {exercise.name}
                    </Link>
                  </td>
                  <td>{exercise.muscleGroup ?? '—'}</td>
                  <td>
                    <ExerciseStatusBadge isActive={exercise.isActive} />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleStatus(exercise.id, exercise.isActive)
                      }
                      disabled={
                        updateStatusMutation.isPending &&
                        updateStatusMutation.variables?.id === exercise.id
                      }
                    >
                      {exercise.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav className="pagination" aria-label="Paginación de ejercicios">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <span>
              Página {exercisesQuery.data.meta.page} de{' '}
              {exercisesQuery.data.meta.totalPages} (
              {exercisesQuery.data.meta.total} ejercicios)
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(exercisesQuery.data.meta.totalPages, current + 1),
                )
              }
              disabled={page >= exercisesQuery.data.meta.totalPages}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}

      {updateStatusMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo actualizar el estado del ejercicio.
        </p>
      )}
    </section>
  );
}
