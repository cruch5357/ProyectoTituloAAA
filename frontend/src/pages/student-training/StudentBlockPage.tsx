import { Link, useParams } from 'react-router-dom';
import { useStudentBlock, useStudentWeeks } from '../../api/studentTraining';
import { ApiError } from '../../lib/apiClient';

// Espejo de solo lectura de BlockDetailPage.tsx (Coach): lista las semanas
// de un bloque asignado. Nunca permite crear/editar nada.
export function StudentBlockPage() {
  const { id } = useParams<{ id: string }>();
  const blockQuery = useStudentBlock(id);
  const weeksQuery = useStudentWeeks(id);

  if (blockQuery.isLoading) {
    return <p>Cargando bloque…</p>;
  }

  if (blockQuery.isError) {
    const message =
      blockQuery.error instanceof ApiError
        ? blockQuery.error.message
        : 'No se pudo cargar el bloque.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!blockQuery.data) {
    return null;
  }

  const block = blockQuery.data;

  return (
    <section>
      <p>
        <Link to={`/student/programs/${block.programId}`}>
          ← Volver al programa
        </Link>
      </p>

      <h1>{block.name}</h1>

      <h2>Semanas</h2>

      {weeksQuery.isLoading && <p>Cargando semanas…</p>}

      {weeksQuery.isError && (
        <p role="alert" className="field-error">
          No se pudieron cargar las semanas de este bloque.
        </p>
      )}

      {weeksQuery.isSuccess && weeksQuery.data.length === 0 && (
        <p>Este bloque todavía no tiene semanas.</p>
      )}

      {weeksQuery.isSuccess && weeksQuery.data.length > 0 && (
        <ul className="nested-list">
          {weeksQuery.data.map((week) => (
            <li key={week.id}>
              <Link to={`/student/weeks/${week.id}`}>Semana {week.number}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
