import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStudentSessionDetail } from '../../api/studentTraining';
import {
  useSessionWorkoutLogs,
  useStartWorkoutLog,
} from '../../api/workoutLogs';
import { ApiError } from '../../lib/apiClient';
import { WorkoutCompletionStatusBadge } from './WorkoutCompletionStatusBadge';

// Pantalla central del flujo de ejecución del Alumno (PROMPT 10, RF-21):
// muestra la sesión asignada + su prescripción completa (solo lectura,
// idéntica a la que ya ve el Coach en SessionDetailPage), la lista de los
// propios WorkoutLog ya registrados para esta sesión (para reanudar en vez
// de duplicar), y el botón para iniciar un entrenamiento nuevo.
export function StudentSessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionQuery = useStudentSessionDetail(id);

  if (sessionQuery.isLoading) {
    return <p>Cargando sesión…</p>;
  }

  if (sessionQuery.isError) {
    const message =
      sessionQuery.error instanceof ApiError
        ? sessionQuery.error.message
        : 'No se pudo cargar la sesión.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!sessionQuery.data) {
    return null;
  }

  const session = sessionQuery.data;

  return (
    <section>
      <p>
        <Link to={`/student/weeks/${session.weekId}`}>← Volver a la semana</Link>
      </p>

      <h1>{session.name}</h1>

      <h2>Prescripción del coach</h2>

      {session.exercises.length === 0 && (
        <p>Esta sesión todavía no tiene ejercicios prescritos.</p>
      )}

      {session.exercises.length > 0 && (
        <table className="students-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ejercicio</th>
              <th>Series</th>
              <th>Reps</th>
              <th>RPE</th>
              <th>RIR</th>
              <th>Descanso</th>
            </tr>
          </thead>
          <tbody>
            {session.exercises.map((item) => (
              <tr key={item.id}>
                <td>{item.order}</td>
                <td>{item.exercise.name}</td>
                <td>{item.targetSets ?? '—'}</td>
                <td>
                  {item.targetRepsMin !== null && item.targetRepsMax !== null
                    ? item.targetRepsMin === item.targetRepsMax
                      ? item.targetRepsMin
                      : `${item.targetRepsMin}-${item.targetRepsMax}`
                    : '—'}
                </td>
                <td>{item.targetRpe ?? '—'}</td>
                <td>{item.targetRir ?? '—'}</td>
                <td>{item.restSeconds !== null ? `${item.restSeconds}s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SessionWorkoutLogsSection sessionId={session.id} />
    </section>
  );
}

function SessionWorkoutLogsSection({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const workoutLogsQuery = useSessionWorkoutLogs(sessionId);
  const startMutation = useStartWorkoutLog(sessionId);

  async function handleStart() {
    try {
      const created = await startMutation.mutateAsync();
      navigate(`/workout-logs/${created.id}`);
    } catch {
      // El error queda disponible en startMutation.error.
    }
  }

  return (
    <section>
      <h2>Tus entrenamientos de esta sesión</h2>

      {workoutLogsQuery.isLoading && <p>Cargando tus registros…</p>}

      {workoutLogsQuery.isSuccess && workoutLogsQuery.data.length === 0 && (
        <p>Todavía no registraste ningún entrenamiento de esta sesión.</p>
      )}

      {workoutLogsQuery.isSuccess && workoutLogsQuery.data.length > 0 && (
        <ul className="nested-list">
          {workoutLogsQuery.data.map((log) => (
            <li key={log.id}>
              <Link to={`/workout-logs/${log.id}`}>
                {new Date(log.performedAt).toLocaleString()}
              </Link>{' '}
              <WorkoutCompletionStatusBadge status={log.completionStatus} />
              {log.durationMinutes === null && ' (en curso)'}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void handleStart()}
        disabled={startMutation.isPending}
      >
        {startMutation.isPending ? 'Iniciando…' : 'Iniciar entrenamiento'}
      </button>

      {startMutation.isError && (
        <p role="alert" className="field-error">
          {startMutation.error instanceof ApiError
            ? startMutation.error.message
            : 'No se pudo iniciar el entrenamiento.'}
        </p>
      )}
    </section>
  );
}
