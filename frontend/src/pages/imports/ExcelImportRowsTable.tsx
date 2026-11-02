import type { ExcelImportRow } from '../../types/excelImport';

// Nombre en español de cada columna (mismo texto que los encabezados de la
// plantilla, ver backend/src/common/imports/excel-template.ts).
const FIELD_LABELS: Record<string, string> = {
  program_name: 'Programa',
  program_description: 'Descripción del programa',
  duration_weeks: 'Duración (semanas)',
  block_name: 'Bloque',
  block_order: 'Orden bloque',
  week_number: 'Semana',
  week_order: 'Orden semana',
  session_name: 'Sesión',
  day_of_week: 'Día',
  session_order: 'Orden sesión',
  exercise_name: 'Ejercicio',
  exercise_order: 'Orden ejercicio',
  target_sets: 'Series',
  target_reps_min: 'Reps mín',
  target_reps_max: 'Reps máx',
  target_rpe: 'RPE',
  target_rir: 'RIR',
  rest_seconds: 'Descanso (seg)',
  notes: 'Notas',
};

// Tabla de filas procesadas de un batch (PROMPT 13, "vista previa"; columna
// "Resultado" agregada en PROMPT 14). Muestra SIEMPRE lo que se entendió de
// cada fila (aunque tenga errores) más sus errores, para que el coach sepa
// exactamente qué corregir antes de reintentar — nunca solo "fila 5:
// inválida" sin detalle. La columna "Resultado" refleja
// `resultSessionExerciseId`: es la única forma explícita, sin adivinar nada
// a partir de `status`, de saber qué filas ya generaron una prescripción
// real tras confirmar (requisito explícito de PROMPT 14).
export function ExcelImportRowsTable({ rows }: { rows: ExcelImportRow[] }) {
  if (rows.length === 0) {
    return <p>El archivo no tiene filas de datos.</p>;
  }

  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Tabla de datos"
      tabIndex={0}
    >
      <table className="students-table">
        <thead>
          <tr>
            <th>Fila</th>
            <th>Estado</th>
            <th>Programa / Bloque / Semana / Sesión</th>
            <th>Ejercicio</th>
            <th>Prescripción</th>
            <th>Resultado</th>
            <th>Errores</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.rowNumber}</td>
              <td>
                <span
                  className={
                    row.status === 'VALID'
                      ? 'badge badge--success'
                      : 'badge badge--danger'
                  }
                >
                  {row.status === 'VALID' ? 'Válida' : 'Inválida'}
                </span>
              </td>
              <td>
                {row.data?.programName ?? '—'} / {row.data?.blockName ?? '—'} /{' '}
                {row.data?.weekNumber ?? '—'} / {row.data?.sessionName ?? '—'}
              </td>
              <td>
                {row.data?.exerciseName ?? '—'}
                {row.data?.exerciseOrder !== undefined
                  ? ` (orden ${row.data.exerciseOrder})`
                  : ''}
              </td>
              <td>
                {row.data?.targetSets !== undefined
                  ? `${row.data.targetSets}x`
                  : '—'}
                {row.data?.targetRepsMin !== undefined
                  ? `${row.data.targetRepsMin}-${row.data.targetRepsMax ?? row.data.targetRepsMin}`
                  : ''}
              </td>
              <td>
                {row.resultSessionExerciseId ? (
                  <span className="badge badge--success">
                    Ejercicio programado
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {row.errors && row.errors.length > 0 ? (
                  <ul className="field-error-list">
                    {row.errors.map((error, index) => (
                      <li key={`${row.id}-${index}`} role="alert">
                        <strong>
                          {FIELD_LABELS[error.field] ?? error.field}:
                        </strong>{' '}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
