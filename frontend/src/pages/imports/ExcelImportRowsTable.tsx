import type { ExcelImportRow } from '../../types/excelImport';

const number = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

function prescription(data: ExcelImportRow['data']): string {
  if (!data) return '—';
  const parts = [
    `${data.sets ?? 1} × ${data.reps ?? '—'}`,
    data.weight !== undefined ? `${number(data.weight)} kg` : null,
    data.rpe !== undefined ? `RPE ${number(data.rpe)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

// Lo que se entendió de cada fila, aunque tenga errores, para que el coach
// compare con su Excel. Las filas con errores se marcan y muestran la celda.
export function ExcelImportRowsTable({ rows }: { rows: ExcelImportRow[] }) {
  if (rows.length === 0) {
    return <p>El archivo no tiene filas de datos.</p>;
  }
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Filas del archivo"
      tabIndex={0}
    >
      <table className="students-table import-rows">
        <thead>
          <tr>
            <th>Fila</th>
            <th>Bloque</th>
            <th>Semana</th>
            <th>Día</th>
            <th>Ejercicio</th>
            <th>Series × reps · carga</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={
                row.status === 'INVALID' ? 'import-rows__invalid' : undefined
              }
            >
              <td>{row.rowNumber}</td>
              <td>{row.data?.blockName ?? '—'}</td>
              <td>{row.data?.weekNumber ?? '—'}</td>
              <td>{row.data?.dayName ?? '—'}</td>
              <td>{row.data?.exerciseName ?? '—'}</td>
              <td>{prescription(row.data)}</td>
              <td>
                {row.status === 'VALID' ? (
                  <span className="badge badge--success">Correcta</span>
                ) : (
                  <span className="badge badge--danger">
                    Corregir{' '}
                    {(row.errors ?? [])
                      .map((error) => error.cell)
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
