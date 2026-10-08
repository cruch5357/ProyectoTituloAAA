import { useCalendar } from '../../api/coaching';
import { PersonalPerformance } from '../../components/ui/PersonalPerformance';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStudentDashboard } from '../../api/dashboard';
import { useExercises } from '../../api/exercises';
import { ApiError } from '../../lib/apiClient';
import { EvolutionChart } from '../../components/ui/EvolutionChart';
import { Skeleton } from '../../components/ui/Primitives';

function formatNumber(value: number | null, digits = 1): string {
  return value !== null ? value.toFixed(digits) : '—';
}

// Dashboard del Coach — vista de UN alumno propio (PROMPT 12, RF-26). El
// `:studentId` de la URL es solo una ayuda de UX (mismo criterio que
// StudentDetailPage, PROMPT 04): la verificación real de que este alumno
// pertenece al coach autenticado la hace SIEMPRE el backend
// (DashboardStudentService.getStudentDashboard(), reutilizando
// StudentsService.getOwnedByCoach()) -- si no es así, la consulta falla con
// 404 y esta página lo muestra como error, nunca inventa datos.
export function StudentDashboardPage({
  embedded = false,
  studentIdOverride,
}: {
  embedded?: boolean;
  studentIdOverride?: string;
}) {
  const params = useParams<{ studentId: string }>();
  const studentId = studentIdOverride ?? params.studentId;
  const calendar = useCalendar(studentId);
  const [blockName, setBlockName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [exercisePage, setExercisePage] = useState(1);

  // Catálogo propio del coach para elegir un ejercicio puntual (RF-26,
  // "métricas de ejercicios") -- reutiliza useExercises ya existente desde
  // PROMPT 07, sin ningún endpoint nuevo para esto.
  const exercisesQuery = useExercises({
    page: exercisePage,
    limit: 30,
    search: exerciseSearch || undefined,
  });

  const dashboardQuery = useStudentDashboard(studentId, {
    blockId: blockName || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    exerciseId: exerciseId || undefined,
  });

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section>
      {!embedded && (
        <p>
          <Link to="/dashboard">← Volver al Dashboard</Link>
        </p>
      )}

      {dashboardQuery.isLoading && (
        <Skeleton label="Cargando métricas del alumno…" />
      )}

      {dashboardQuery.isError && (
        <p role="alert" className="field-error">
          {dashboardQuery.error instanceof ApiError
            ? dashboardQuery.error.message
            : 'No se pudo cargar el alumno.'}
        </p>
      )}

      {dashboardQuery.isSuccess && (
        <>
          {embedded ? (
            <h2>Perfil Estadístico</h2>
          ) : (
            <>
              <h1>{dashboardQuery.data.student.name}</h1>
              <p>{dashboardQuery.data.student.email}</p>
            </>
          )}

          <form onSubmit={handleFiltersSubmit} className="search-form">
            <label className="field">
              <span>Desde</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
            {exercisesQuery.data && exercisesQuery.data.items.length > 0 && (
              <label className="field">
                <span>Ejercicio</span>
                <select
                  value={exerciseId}
                  onChange={(event) => setExerciseId(event.target.value)}
                >
                  <option value="">Ninguno</option>
                  {exercisesQuery.data.items.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form>

          <label className="field">Bloque<select value={blockName} onChange={(e) => setBlockName(e.target.value)}><option value="">Todos</option>{Array.from(new Map((calendar.data?.sessions ?? []).map((s) => [s.blockId, s.blockName])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="field exercise-search">
            Buscar en el catálogo
            <input
              type="search"
              placeholder="Nombre del ejercicio…"
              value={exerciseSearch}
              onChange={(event) => {
                setExerciseSearch(event.target.value);
                setExercisePage(1);
              }}
            />
          </label>
          {exercisesQuery.isError && (
            <p role="alert" className="field-error">
              No pudimos cargar el catálogo.{' '}
              <button
                type="button"
                onClick={() => void exercisesQuery.refetch()}
              >
                Reintentar
              </button>
            </p>
          )}
          {exercisesQuery.data && (
            <>
              <div className="chips" aria-label="Filtrar por ejercicio">
                {exercisesQuery.data.items.map((exercise) => (
                  <button
                    type="button"
                    key={exercise.id}
                    aria-pressed={exerciseId === exercise.id}
                    onClick={() =>
                      setExerciseId(
                        exerciseId === exercise.id ? '' : exercise.id,
                      )
                    }
                  >
                    {exercise.name}
                  </button>
                ))}
              </div>
              {exercisesQuery.data.meta.totalPages > 1 && (
                <nav className="pagination" aria-label="Páginas del catálogo">
                  <button
                    type="button"
                    disabled={exercisePage <= 1}
                    onClick={() => setExercisePage(exercisePage - 1)}
                  >
                    Ejercicios anteriores
                  </button>
                  <span>
                    Página {exercisePage} de{' '}
                    {exercisesQuery.data.meta.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={
                      exercisePage >= exercisesQuery.data.meta.totalPages
                    }
                    onClick={() => setExercisePage(exercisePage + 1)}
                  >
                    Más ejercicios
                  </button>
                </nav>
              )}
            </>
          )}
          {exerciseId && (
            <EvolutionChart
              points={dashboardQuery.data.exerciseEvolution ?? []}
            />
          )}
          {dashboardQuery.data.workoutsRegistered === 0 && (
            <p>
              Este alumno todavía no tiene entrenamientos registrados en este
              rango.
            </p>
          )}
          <PersonalPerformance
            summary={dashboardQuery.data.summary}
            recent={dashboardQuery.data.recentPerformance}
            registered={dashboardQuery.data.workoutsRegistered}
          />
          <p className="muted">
            Fatiga promedio (historial consultado):{' '}
            {formatNumber(dashboardQuery.data.summary.averageFatigue)} · Series
            registradas: {dashboardQuery.data.summary.totalSetLogs}
          </p>

          {dashboardQuery.data.workoutsFinished > 0 && (
            <>
              <h2>Cumplimiento (entrenamientos finalizados)</h2>
              <p>
                Completados:{' '}
                {dashboardQuery.data.completionStatusBreakdown.completed} ·
                Parciales:{' '}
                {dashboardQuery.data.completionStatusBreakdown.partial} ·
                Omitidos:{' '}
                {dashboardQuery.data.completionStatusBreakdown.skipped}
              </p>
            </>
          )}

          {exerciseId && (
            <div>
              <h2>Evolución del ejercicio seleccionado</h2>
              {(!dashboardQuery.data.exerciseEvolution ||
                dashboardQuery.data.exerciseEvolution.length === 0) && (
                <p>
                  Este alumno todavía no registró series de este ejercicio en
                  este rango.
                </p>
              )}
              {dashboardQuery.data.exerciseEvolution &&
                dashboardQuery.data.exerciseEvolution.length > 0 && (
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label="Tabla de datos"
                    tabIndex={0}
                  >
                    <table className="students-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Carga máxima</th>
                          <th>Reps totales</th>
                          <th>Series</th><th>Volumen (carga × reps)</th><th>RPE</th><th>RIR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardQuery.data.exerciseEvolution.map((point) => (
                          <tr key={point.workoutLogId}>
                            <td>
                              {new Date(point.performedAt).toLocaleDateString()}
                            </td>
                            <td>{point.maxActualLoad ?? '—'}</td>
                            <td>{point.totalActualReps ?? '—'}</td>
                            <td>{point.setCount}</td><td>{point.volume?.toFixed(1) ?? "—"}</td><td>{point.averageRpe?.toFixed(1) ?? "—"}</td><td>{point.averageRir?.toFixed(1) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
