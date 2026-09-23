import { Link } from 'react-router-dom';
import { useMyProgramAssignments } from '../../api/programAssignments';
import { ApiError } from '../../lib/apiClient';
import { AssignmentStatusBadge } from './AssignmentStatusBadge';

// Vista mínima del Alumno (PROMPT 09, "ACCESO DEL ALUMNO"): únicamente
// visualizar los programas que su coach le asignó — el backend
// (GET /program-assignments/me) filtra siempre por el alumno autenticado,
// nunca por un id que esta página pudiera enviar. Respeta la arquitectura
// responsive existente (mismas clases ya usadas en "Mis alumnos"/"Mis
// programas": `.page-header`, `.students-table`, `.status-badge`).
//
// PROMPT 10 agregó la navegación real hacia Program -> Block -> Week ->
// Session -> WorkoutLog (backend/src/student-training/, rutas
// /student/...): el nombre del programa ahora enlaza a esa jerarquía de
// solo lectura, desde donde el alumno llega a iniciar/registrar su
// ejecución real (RF-21 a RF-23, docs/requirements.md).
export function MyAssignedProgramsPage() {
  const assignmentsQuery = useMyProgramAssignments();

  return (
    <section>
      <div className="page-header">
        <h1>Mis programas asignados</h1>
      </div>

      {assignmentsQuery.isLoading && <p>Cargando tus programas…</p>}

      {assignmentsQuery.isError && (
        <p role="alert" className="field-error">
          {assignmentsQuery.error instanceof ApiError
            ? assignmentsQuery.error.message
            : 'No se pudo cargar tus programas asignados.'}
        </p>
      )}

      {assignmentsQuery.isSuccess && assignmentsQuery.data.length === 0 && (
        <p>Todavía no tienes ningún programa asignado por tu coach.</p>
      )}

      {assignmentsQuery.isSuccess && assignmentsQuery.data.length > 0 && (
        <table className="students-table">
          <thead>
            <tr>
              <th>Programa</th>
              <th>Duración</th>
              <th>Estado</th>
              <th>Asignado</th>
            </tr>
          </thead>
          <tbody>
            {assignmentsQuery.data.map((assignment) => (
              <tr key={assignment.id}>
                <td>
                  {assignment.program ? (
                    <Link to={`/student/programs/${assignment.program.id}`}>
                      {assignment.program.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {assignment.program?.durationWeeks
                    ? `${assignment.program.durationWeeks} semanas`
                    : '—'}
                </td>
                <td>
                  <AssignmentStatusBadge status={assignment.status} />
                </td>
                <td>{new Date(assignment.assignedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
