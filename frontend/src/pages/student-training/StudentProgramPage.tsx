import { Link, useParams } from 'react-router-dom';
import { useStudentBlocks, useStudentProgram } from '../../api/studentTraining';
import { ApiError } from '../../lib/apiClient';

// Vista de solo lectura del Alumno sobre un programa asignado (PROMPT 10):
// nombre/descripción/duración + lista de bloques, navegando hacia
// Block -> Week -> Session -> WorkoutLog. Espejo de solo lectura de
// ProgramDetailPage.tsx (Coach): nunca permite crear/editar nada.
export function StudentProgramPage() {
  const { id } = useParams<{ id: string }>();
  const programQuery = useStudentProgram(id);
  const blocksQuery = useStudentBlocks(id);

  if (programQuery.isLoading) {
    return <p>Cargando programa…</p>;
  }

  if (programQuery.isError) {
    const message =
      programQuery.error instanceof ApiError
        ? programQuery.error.message
        : 'No se pudo cargar el programa.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!programQuery.data) {
    return null;
  }

  const program = programQuery.data;

  return (
    <section>
      <p>
        <Link to="/my-programs">← Volver a mis programas asignados</Link>
      </p>

      <h1>{program.name}</h1>
      {program.description && <p>{program.description}</p>}
      <p>
        {program.durationWeeks
          ? `Duración: ${program.durationWeeks} semanas`
          : 'Duración no especificada'}
      </p>

      <h2>Bloques</h2>

      {blocksQuery.isLoading && <p>Cargando bloques…</p>}

      {blocksQuery.isError && (
        <p role="alert" className="field-error">
          No se pudieron cargar los bloques de este programa.
        </p>
      )}

      {blocksQuery.isSuccess && blocksQuery.data.length === 0 && (
        <p>Este programa todavía no tiene bloques.</p>
      )}

      {blocksQuery.isSuccess && blocksQuery.data.length > 0 && (
        <ul className="nested-list">
          {blocksQuery.data.map((block) => (
            <li key={block.id}>
              <Link to={`/student/blocks/${block.id}`}>{block.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
