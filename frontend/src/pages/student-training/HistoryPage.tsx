import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useWorkoutEvolution,
  useWorkoutLogsHistory,
} from '../../api/workoutLogs';
import { useMyProgramAssignments } from '../../api/programAssignments';
import { ApiError } from '../../lib/apiClient';
import type { WorkoutCompletionStatus } from '../../types/workoutLog';
import { WorkoutCompletionStatusBadge } from './WorkoutCompletionStatusBadge';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: WorkoutCompletionStatus; label: string }[] = [
  { value: 'COMPLETED', label: 'Completado' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'SKIPPED', label: 'Omitido' },
];

function formatNumber(value: number | null, digits = 1): string {
  return value !== null ? value.toFixed(digits) : '—';
}

// "Mi historial" (PROMPT 11, RF-25): historial de entrenamientos REALMENTE
// registrados (WorkoutLog/SetLog, nunca reconstruidos desde la
// prescripción) + una primera capa de evolución básica descriptiva.
//
// Los filtros (fechas, estado, programa) viajan tal cual al backend como
// query params -- nunca se resuelve nada de propiedad acá: el alumno
// autenticado sale siempre del token en el backend (ver
// docs/api.md, "Estado de implementación (PROMPT 11)").
export function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [completionStatus, setCompletionStatus] = useState<
    WorkoutCompletionStatus | ''
  >('');
  const [programId, setProgramId] = useState('');

  const exerciseId = searchParams.get('exerciseId') ?? undefined;
  const exerciseName = searchParams.get('exerciseName') ?? undefined;

  const assignmentsQuery = useMyProgramAssignments();
  const programOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const assignment of assignmentsQuery.data ?? []) {
      if (assignment.program) {
        seen.set(assignment.program.id, assignment.program.name);
      }
    }
    return Array.from(seen.entries());
  }, [assignmentsQuery.data]);

  const commonFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    programId: programId || undefined,
  };

  const historyQuery = useWorkoutLogsHistory({
    page,
    limit: PAGE_SIZE,
    ...commonFilters,
    completionStatus: completionStatus || undefined,
  });

  const evolutionQuery = useWorkoutEvolution({
    ...commonFilters,
    exerciseId,
  });

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
  }

  function clearExerciseFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('exerciseId');
    next.delete('exerciseName');
    setSearchParams(next);
  }

  return (
    <section>
      <h1>Mi historial</h1>
      <p>
        Entrenamientos realmente registrados y una primera vista de tu
        evolución, calculada únicamente a partir de esos registros.
      </p>

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
        <label className="field">
          <span>Estado</span>
          <select
            value={completionStatus}
            onChange={(event) =>
              setCompletionStatus(
                event.target.value as WorkoutCompletionStatus | '',
              )
            }
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {programOptions.length > 0 && (
          <label className="field">
            <span>Programa</span>
            <select
              value={programId}
              onChange={(event) => setProgramId(event.target.value)}
            >
              <option value="">Todos</option>
              {programOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit">Filtrar</button>
      </form>

      <h2>Evolución básica</h2>

      {evolutionQuery.isLoading && <p>Calculando tu evolución…</p>}

      {evolutionQuery.isError && (
        <p role="alert" className="field-error">
          {evolutionQuery.error instanceof ApiError
            ? evolutionQuery.error.message
            : 'No se pudo calcular tu evolución.'}
        </p>
      )}

      {evolutionQuery.isSuccess && (
        <>
          {evolutionQuery.data.summary.totalWorkouts === 0 ? (
            <p>
              Todavía no tienes entrenamientos finalizados en este rango para
              calcular una evolución.
            </p>
          ) : (
            <div className="stat-cards">
              <div className="stat-card">
                <span className="stat-card__label">Entrenamientos realizados</span>
                <span className="stat-card__value">
                  {evolutionQuery.data.summary.totalWorkouts}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Frecuencia (por semana)</span>
                <span className="stat-card__value">
                  {formatNumber(evolutionQuery.data.summary.trainingFrequencyPerWeek)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Duración promedio (min)</span>
                <span className="stat-card__value">
                  {formatNumber(evolutionQuery.data.summary.averageDurationMinutes, 0)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">RPE promedio</span>
                <span className="stat-card__value">
                  {formatNumber(evolutionQuery.data.summary.averageOverallRpe)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Fatiga promedio</span>
                <span className="stat-card__value">
                  {formatNumber(evolutionQuery.data.summary.averageFatigue)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Series registradas</span>
                <span className="stat-card__value">
                  {evolutionQuery.data.summary.totalSetLogs}
                </span>
              </div>
            </div>
          )}

          {exerciseId && (
            <div>
              <h3>
                Evolución de {exerciseName ?? 'este ejercicio'}{' '}
                <button type="button" onClick={clearExerciseFilter}>
                  Quitar filtro
                </button>
              </h3>
              {(!evolutionQuery.data.exerciseEvolution ||
                evolutionQuery.data.exerciseEvolution.length === 0) && (
                <p>Todavía no registraste series de este ejercicio en este rango.</p>
              )}
              {evolutionQuery.data.exerciseEvolution &&
                evolutionQuery.data.exerciseEvolution.length > 0 && (
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
                      {evolutionQuery.data.exerciseEvolution.map((point) => (
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

      <h2>Entrenamientos</h2>

      {historyQuery.isLoading && <p>Cargando tu historial…</p>}

      {historyQuery.isError && (
        <p role="alert" className="field-error">
          {historyQuery.error instanceof ApiError
            ? historyQuery.error.message
            : 'No se pudo cargar tu historial.'}
        </p>
      )}

      {historyQuery.isSuccess && historyQuery.data.items.length === 0 && (
        <p>Todavía no tienes entrenamientos registrados con estos filtros.</p>
      )}

      {historyQuery.isSuccess && historyQuery.data.items.length > 0 && (
        <>
          <table className="students-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sesión</th>
                <th>Programa</th>
                <th>Estado</th>
                <th>Duración</th>
                <th>Series</th>
              </tr>
            </thead>
            <tbody>
              {historyQuery.data.items.map((workoutLog) => (
                <tr key={workoutLog.id}>
                  <td>
                    <Link to={`/workout-logs/${workoutLog.id}`}>
                      {new Date(workoutLog.performedAt).toLocaleString()}
                    </Link>
                  </td>
                  <td>{workoutLog.session?.name ?? '—'}</td>
                  <td>{workoutLog.session?.week.block.program.name ?? '—'}</td>
                  <td>
                    <WorkoutCompletionStatusBadge
                      status={workoutLog.completionStatus}
                    />{' '}
                    {workoutLog.durationMinutes === null && '(en curso)'}
                  </td>
                  <td>
                    {workoutLog.durationMinutes !== null
                      ? `${workoutLog.durationMinutes} min`
                      : '—'}
                  </td>
                  <td>{workoutLog.setLogsCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav className="pagination" aria-label="Paginación del historial">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <span>
              Página {historyQuery.data.meta.page} de{' '}
              {historyQuery.data.meta.totalPages} (
              {historyQuery.data.meta.total} entrenamientos)
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(historyQuery.data.meta.totalPages, current + 1),
                )
              }
              disabled={page >= historyQuery.data.meta.totalPages}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
