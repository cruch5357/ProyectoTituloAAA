import { Link, useParams } from 'react-router-dom';
import { useStudent, useUpdateStudentStatus } from '../../api/students';
import { ApiError } from '../../lib/apiClient';
import { StudentStatusBadge } from './StudentStatusBadge';

// Detalle de un alumno propio (PROMPT 04, punto 15). Muestra ÚNICAMENTE
// información que el backend ya expone hoy (nombre, correo, estado, fecha
// de alta). NO se inventan estadísticas, progreso ni métricas de
// entrenamiento: esa funcionalidad no existe todavía (PROMPT 04, punto 24)
// y agregar datos simulados acá sería engañoso para el coach.
export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const studentQuery = useStudent(id);
  const updateStatusMutation = useUpdateStudentStatus();

  if (studentQuery.isLoading) {
    return <p>Cargando alumno…</p>;
  }

  if (studentQuery.isError) {
    // El backend responde 404 tanto si el alumno no existe como si
    // pertenece a otro coach (nunca 403 — ver docs/security.md), así que
    // acá no se distingue entre esos dos casos tampoco.
    const message =
      studentQuery.error instanceof ApiError
        ? studentQuery.error.message
        : 'No se pudo cargar el alumno.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
        <Link to="/students">Volver a Mis alumnos</Link>
      </section>
    );
  }

  const student = studentQuery.data;
  if (!student) {
    return null;
  }

  return (
    <section>
      <p>
        <Link to="/students">← Volver a Mis alumnos</Link>
      </p>

      <div className="page-header">
        <h1>{student.name}</h1>
        <StudentStatusBadge isActive={student.isActive} />
      </div>

      <dl className="detail-list">
        <div>
          <dt>Correo</dt>
          <dd>{student.email}</dd>
        </div>
        <div>
          <dt>Alumno desde</dt>
          <dd>{new Date(student.createdAt).toLocaleDateString()}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() =>
          updateStatusMutation.mutate({
            id: student.id,
            isActive: !student.isActive,
          })
        }
        disabled={updateStatusMutation.isPending}
      >
        {student.isActive ? 'Desactivar alumno' : 'Activar alumno'}
      </button>

      {updateStatusMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo actualizar el estado del alumno.
        </p>
      )}

      {/* RF-26 (Dashboard del Coach por alumno) implementado en PROMPT 12:
          ver DashboardStudentService.getStudentDashboard(), que reutiliza
          EXACTAMENTE esta misma verificación de propiedad
          (StudentsService.getOwnedByCoach()) antes de calcular cualquier
          métrica. Programas asignados/historial de sesiones detallado
          siguen fuera de alcance de esta página (PROMPT 04, punto 15). */}
      <p>
        <Link to={`/dashboard/students/${student.id}`}>
          Ver métricas de entrenamiento de este alumno
        </Link>
      </p>
    </section>
  );
}
