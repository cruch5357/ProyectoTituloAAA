import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStudentDashboard } from '../../api/dashboard';
import { useExercises } from '../../api/exercises';
import { ApiError } from '../../lib/apiClient';

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
export function StudentDashboardPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exerciseId, setExerciseId] = useState('');

  // Catálogo propio del coach para elegir un ejercicio puntual (RF-26,
  // "métricas de ejercicios") -- reutiliza useExercises ya existente desde
  // PROMPT 07, sin ningún endpoint nuevo para esto.
  const exercisesQuery = useExercises({ page: 1, limit: 100 });

  const dashboardQuery = useStudentDashboard(studentId, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    exerciseId: exerciseId || undefined,
  });

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section>
      <p>
        <Link to="/dashboard">← Volver al Dashboard</Link>
      </p>

      {dashboardQuery.isLoading && <p>Cargando métricas del alumno…</p>}

      {dashboardQuery.isError && (
        <p role="alert" className="field-error">
          {dashboardQuery.error instanceof ApiError
            ? dashboardQuery.error.message
            : 'No se pudo cargar el alumno.'}
        </p>
      )}

      {dashboardQuery.isSuccess && (
        <>
          <h1>{dashboardQuery.data.student.name}</h1>
          <p>{dashboardQuery.data.student.email}</p>

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

          {dashboardQuery.data.workoutsRegistered === 0 ? (
            <p>Este alumno todavía no tiene entrenamientos registrados en este rango.</p>
          ) : (
            <div className="stat-cards">
              <div className="stat-card">
                <span className="stat-card__label">Entrenamientos registrados</span>
                <span className="stat-card__value">
                  {dashboardQuery.data.workoutsRegistered}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Entrenamientos finalizados</span>
                <span className="stat-card__value">
                  {dashboardQuery.data.workoutsFinished}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Frecuencia (por semana)</span>
                <span className="stat-card__value">
                  {formatNumber(dashboardQuery.data.summary.trainingFrequencyPerWeek)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Duración promedio (min)</span>
                <span className="stat-card__value">
                  {formatNumber(dashboardQuery.data.summary.averageDurationMinutes, 0)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">RPE promedio</span>
                <span className="stat-card__value">
                  {formatNumber(dashboardQuery.data.summary.averageOverallRpe)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Fatiga promedio</span>
                <span className="stat-card__value">
                  {formatNumber(dashboardQuery.data.summary.averageFatigue)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Series registradas</span>
                <span className="stat-card__value">
                  {dashboardQuery.data.summary.totalSetLogs}
                </span>
              </div>
            </div>
          )}

          {dashboardQuery.data.workoutsFinished > 0 && (
            <>
              <h2>Cumplimiento (entrenamientos finalizados)</h2>
              <p>
                Completados: {dashboardQuery.data.completionStatusBreakdown.completed} ·
                Parciales: {dashboardQuery.data.completionStatusBreakdown.partial} ·
                Omitidos: {dashboardQuery.data.completionStatusBreakdown.skipped}
              </p>
            </>
          )}

          {exerciseId && (
            <div>
              <h2>Evolución del ejercicio seleccionado</h2>
              {(!dashboardQuery.data.exerciseEvolution ||
                dashboardQuery.data.exerciseEvolution.length === 0) && (
                <p>Este alumno todavía no registró series de este ejercicio en este rango.</p>
              )}
              {dashboardQuery.data.exerciseEvolution &&
                dashboardQuery.data.exerciseEvolution.length > 0 && (
                  <table className="students-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Carga máxima</th>
                        <th>Reps totales</th>
                        <th>Series</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardQuery.data.exerciseEvolution.map((point) => (
                        <tr key={point.workoutLogId}>
                          <td>{new Date(point.performedAt).toLocaleDateString()}</td>
                          <td>{point.maxActualLoad ?? '—'}</td>
                          <td>{point.totalActualReps ?? '—'}</td>
                          <td>{point.setCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
