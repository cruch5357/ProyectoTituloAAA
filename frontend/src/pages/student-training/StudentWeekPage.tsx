import { Link, useParams } from 'react-router-dom';
import { useStudentSessions, useStudentWeek } from '../../api/studentTraining';
import { ApiError } from '../../lib/apiClient';

// Espejo de solo lectura de WeekDetailPage.tsx (Coach): lista las sesiones
// de una semana asignada. Nunca permite crear/editar nada.
export function StudentWeekPage() {
  const { id } = useParams<{ id: string }>();
  const weekQuery = useStudentWeek(id);
  const sessionsQuery = useStudentSessions(id);

  if (weekQuery.isLoading) {
    return <p>Cargando semana…</p>;
  }

  if (weekQuery.isError) {
    const message =
      weekQuery.error instanceof ApiError
        ? weekQuery.error.message
        : 'No se pudo cargar la semana.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!weekQuery.data) {
    return null;
  }

  const week = weekQuery.data;

  return (
    <section>
      <p>
        <Link to={`/student/blocks/${week.blockId}`}>← Volver al bloque</Link>
      </p>

      <h1>Semana {week.number}</h1>

      <h2>Sesiones</h2>

      {sessionsQuery.isLoading && <p>Cargando sesiones…</p>}

      {sessionsQuery.isError && (
        <p role="alert" className="field-error">
          No se pudieron cargar las sesiones de esta semana.
        </p>
      )}

      {sessionsQuery.isSuccess && sessionsQuery.data.length === 0 && (
        <p>Esta semana todavía no tiene sesiones.</p>
      )}

      {sessionsQuery.isSuccess && sessionsQuery.data.length > 0 && (
        <ul className="nested-list">
          {sessionsQuery.data.map((session) => (
            <li key={session.id}>
              <Link to={`/student/sessions/${session.id}`}>
                {session.order}. {session.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
