import type { ExcelImportRow } from '../../types/excelImport';

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
<span
  className={
    row.status === 'VALID'
      ? 'badge badge--success'
      : 'badge badge--danger'
  }
>
  {row.status === 'VALID' ? 'Válida' : 'Inválida'}
</span>
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
<span className="badge badge--success">Ejercicio programado</span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {row.errors && row.errors.length > 0 ? (
                  <ul className="field-error-list">
                    {row.errors.map((error, index) => (
                      <li key={`${row.id}-${index}`} role="alert">
                        <strong>{error.field}:</strong> {error.message}
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
