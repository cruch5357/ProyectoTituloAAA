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
// Deliberadamente NO navega todavía a Program -> Block -> Week -> Session:
// el alumno no tiene acceso a GET /programs/:id (ese endpoint sigue siendo
// exclusivo de COACH, ver backend/src/programs/programs.controller.ts), así
// que esta pantalla solo muestra el resumen embebido del programa que ya
// viene en la respuesta de la asignación. Queda preparada para que un
// prompt futuro agregue las rutas de solo lectura que el alumno necesitará
// para entrar a esa jerarquía (RF-09 y RF-16, docs/requirements.md).
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
                <td>{assignment.program?.name ?? '—'}</td>
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
