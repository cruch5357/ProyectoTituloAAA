import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useStudents, useUpdateStudentStatus } from '../../api/students';
import { ApiError } from '../../lib/apiClient';
import { StudentStatusBadge } from './StudentStatusBadge';
import { InviteStudentDialog } from './InviteStudentDialog';

const PAGE_SIZE = 20;

// Pantalla "Mis alumnos" del Coach (PROMPT 04, punto 13). Toda la data viene
// de TanStack Query (useStudents): no hay estado de servidor duplicado en
// esta página. El coachId que filtra el listado nunca aparece acá — lo
// resuelve el backend a partir del token (ver StudentsController).
export function StudentsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const studentsQuery = useStudents({ page, limit: PAGE_SIZE, search });
  const updateStatusMutation = useUpdateStudentStatus();

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
        <h1>Mis alumnos</h1>
        <InviteStudentDialog />
      </div>

      <form onSubmit={handleSearchSubmit} className="search-form">
        <label className="field">
          <span>Buscar por nombre o correo</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Ej: Ana, ana@example.com"
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {studentsQuery.isLoading && <p>Cargando alumnos…</p>}

      {studentsQuery.isError && (
        <p role="alert" className="field-error">
          {studentsQuery.error instanceof ApiError
            ? studentsQuery.error.message
            : 'No se pudo cargar el listado de alumnos.'}
        </p>
      )}

      {studentsQuery.isSuccess && studentsQuery.data.items.length === 0 && (
        <p>
          Todavía no tienes alumnos{search ? ' que coincidan con la búsqueda' : ''}.
          Usa &quot;Invitar alumno&quot; para agregar el primero.
        </p>
      )}

      {studentsQuery.isSuccess && studentsQuery.data.items.length > 0 && (
        <>
          <table className="students-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Estado</th>
                <th>Alta</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {studentsQuery.data.items.map((student) => (
                <tr key={student.id}>
                  <td>
                    <Link to={`/students/${student.id}`}>{student.name}</Link>
                  </td>
                  <td>{student.email}</td>
                  <td>
                    <StudentStatusBadge isActive={student.isActive} />
                  </td>
                  <td>{new Date(student.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(student.id, student.isActive)}
                      disabled={
                        updateStatusMutation.isPending &&
                        updateStatusMutation.variables?.id === student.id
                      }
                    >
                      {student.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav className="pagination" aria-label="Paginación de alumnos">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <span>
              Página {studentsQuery.data.meta.page} de{' '}
              {studentsQuery.data.meta.totalPages} ({studentsQuery.data.meta.total}{' '}
              alumnos)
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(studentsQuery.data.meta.totalPages, current + 1),
                )
              }
              disabled={page >= studentsQuery.data.meta.totalPages}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}

      {updateStatusMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo actualizar el estado del alumno.
        </p>
      )}
    </section>
  );
}
