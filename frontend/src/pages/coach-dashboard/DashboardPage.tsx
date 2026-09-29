import { useContext, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardSummary, useRecentActivity } from '../../api/dashboard';
import { ApiError } from '../../lib/apiClient';
import type { WorkoutCompletionStatus } from '../../types/workoutLog';
import { WorkoutCompletionStatusBadge } from '../student-training/WorkoutCompletionStatusBadge';
import { Card, EmptyState, Skeleton } from '../../components/ui/Primitives';
import { AuthContext } from '../../auth/authContextObject';
import { Icon } from '../../components/ui/Icon';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: WorkoutCompletionStatus; label: string }[] = [
  { value: 'COMPLETED', label: 'Completado' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'SKIPPED', label: 'Omitido' },
];

function formatNumber(value: number | null, digits = 1): string {
  return value !== null ? value.toFixed(digits) : '—';
}

// Dashboard del Coach (PROMPT 12, RF-26): resumen agregado de TODOS sus
// alumnos + actividad reciente. Usa EXCLUSIVAMENTE datos realmente
// registrados (WorkoutLog/SetLog) -- ninguna cifra acá es una predicción ni
// una estimación (mismo principio que "Mi historial" del alumno, PROMPT
// 11). El coachId que scopea todo esto nunca aparece en el frontend: sale
// siempre del token en el backend (ver docs/api.md, "Estado de
// implementación (PROMPT 12)").
export function DashboardPage() {
  const auth = useContext(AuthContext);
  const [hour] = useState(() => new Date().getHours());
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [completionStatus, setCompletionStatus] = useState<
    WorkoutCompletionStatus | ''
  >('');

  const summaryQuery = useDashboardSummary();
  const activityQuery = useRecentActivity({
    page,
    limit: PAGE_SIZE,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    completionStatus: completionStatus || undefined,
  });

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
  }

  return (
    <section className="coach-dashboard">
      <p className="eyebrow">Vista general · Coach</p>
      <h1>Dashboard</h1>
      {auth?.user && (
        <p className="dashboard-greeting">
          {hour < 12
            ? 'Buenos días'
            : hour < 20
              ? 'Buenas tardes'
              : 'Buenas noches'}
          , {auth.user.name}.
        </p>
      )}
      <p>
        Métricas agregadas de tus alumnos, calculadas únicamente a partir de los
        entrenamientos que realmente registraron.
      </p>

      <h2>Resumen</h2>

      {summaryQuery.isLoading && <Skeleton label="Cargando resumen…" />}

      {summaryQuery.isError && (
        <p role="alert" className="field-error">
          {summaryQuery.error instanceof ApiError
            ? summaryQuery.error.message
            : 'No se pudo cargar el resumen.'}
        </p>
      )}

      {summaryQuery.isSuccess && summaryQuery.data.totalStudents === 0 && (
        <p>
          Todavía no tienes alumnos.{' '}
          <Link to="/students">Invita al primero desde Mis alumnos</Link>.
        </p>
      )}

      {summaryQuery.isSuccess && (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <Icon name="users" />
              <span className="stat-card__label">Alumnos totales</span>
              <span className="stat-card__value">
                {summaryQuery.data.totalStudents}
              </span>
            </div>
            <div className="stat-card">
              <Icon name="users" />
              <span className="stat-card__label">Alumnos activos</span>
              <span className="stat-card__value">
                {summaryQuery.data.activeStudents}
              </span>
            </div>
            <div className="stat-card">
              <Icon name="program" />
              <span className="stat-card__label">Asignaciones activas</span>
              <span className="stat-card__value">
                {summaryQuery.data.activeAssignments}
              </span>
            </div>
            <div className="stat-card">
              <Icon name="exercise" />
              <span className="stat-card__label">
                Entrenamientos registrados
              </span>
              <span className="stat-card__value">
                {summaryQuery.data.workoutsRegistered}
              </span>
            </div>
            <div className="stat-card">
              <Icon name="activity" />
              <span className="stat-card__label">
                Entrenamientos finalizados
              </span>
              <span className="stat-card__value">
                {summaryQuery.data.workoutsFinished}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Frecuencia (por semana)</span>
              <span className="stat-card__value">
                {formatNumber(
                  summaryQuery.data.summary.trainingFrequencyPerWeek,
                )}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Duración promedio (min)</span>
              <span className="stat-card__value">
                {formatNumber(
                  summaryQuery.data.summary.averageDurationMinutes,
                  0,
                )}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">RPE promedio</span>
              <span className="stat-card__value">
                {formatNumber(summaryQuery.data.summary.averageOverallRpe)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Fatiga promedio</span>
              <span className="stat-card__value">
                {formatNumber(summaryQuery.data.summary.averageFatigue)}
              </span>
            </div>
          </div>

          {summaryQuery.data.workoutsFinished === 0 ? (
            <p>
              Todavía no hay entrenamientos finalizados para calcular una
              distribución de cumplimiento.
            </p>
          ) : (
            <>
              <h3>Distribución de cumplimiento (entrenamientos finalizados)</h3>
              <p>
                Completados:{' '}
                {summaryQuery.data.completionStatusBreakdown.completed} ·
                Parciales: {summaryQuery.data.completionStatusBreakdown.partial}{' '}
                · Omitidos:{' '}
                {summaryQuery.data.completionStatusBreakdown.skipped}
              </p>
            </>
          )}
        </>
      )}

      <div className="dashboard-grid planning-grid">
        <Card>
          <h2>Atletas pendientes</h2>
          <EmptyState
            title="Sin datos de pendientes"
            description="Aún no hay un indicador de atletas que requieren revisión."
          />
        </Card>
        <Card>
          <h2>Necesidades de planificación</h2>
          <EmptyState
            title="Planificación por programa"
            description="Revisa tus bloques y asignaciones desde el espacio de programas."
            action={
              <Link className="button" to="/programs">
                Revisar programas
              </Link>
            }
          />
        </Card>
        <Card>
          <h2>Próximos bloques</h2>
          <EmptyState
            title="Sin fechas programadas"
            description="Los bloques aún no tienen fechas de inicio y término."
          />
        </Card>
        <Card>
          <h2>Próximas competiciones</h2>
          <EmptyState
            title="Sin competiciones disponibles"
            description="Esta información aún no forma parte del modelo actual."
          />
        </Card>
      </div>
      <h2>Actividad reciente</h2>

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
        <button type="submit">Filtrar</button>
      </form>

      {activityQuery.isLoading && (
        <Skeleton label="Cargando actividad reciente…" />
      )}

      {activityQuery.isError && (
        <p role="alert" className="field-error">
          {activityQuery.error instanceof ApiError
            ? activityQuery.error.message
            : 'No se pudo cargar la actividad reciente.'}
        </p>
      )}

      {activityQuery.isSuccess && activityQuery.data.items.length === 0 && (
        <EmptyState title="Sin actividad reciente" description="Todavía no hay actividad registrada con estos filtros." />
      )}

      {activityQuery.isSuccess && activityQuery.data.items.length > 0 && (
        <>
          <div
            className="table-scroll"
            role="region"
            aria-label="Tabla de datos"
            tabIndex={0}
          >
            <table className="students-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Fecha</th>
                  <th>Sesión</th>
                  <th>Programa</th>
                  <th>Estado</th>
                  <th>Duración</th>
                </tr>
              </thead>
              <tbody>
                {activityQuery.data.items.map((workoutLog) => (
                  <tr key={workoutLog.id}>
                    <td data-label="Alumno">
                      {workoutLog.student ? (
                        <Link
                          to={`/dashboard/students/${workoutLog.student.id}`}
                        >
                          {workoutLog.student.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Fecha">
                      {new Date(workoutLog.performedAt).toLocaleString()}
                    </td>
                    <td data-label="Sesión">
                      {workoutLog.session?.name ?? '—'}
                    </td>
                    <td data-label="Programa">
                      {workoutLog.session?.week.block.program.name ?? '—'}
                    </td>
                    <td data-label="Estado">
                      <WorkoutCompletionStatusBadge
                        status={workoutLog.completionStatus}
                      />{' '}
                      {workoutLog.durationMinutes === null && '(en curso)'}
                    </td>
                    <td data-label="Duración">
                      {workoutLog.durationMinutes !== null
                        ? `${workoutLog.durationMinutes} min`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            className="pagination"
            aria-label="Paginación de actividad reciente"
          >
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <span>
              Página {activityQuery.data.meta.page} de{' '}
              {activityQuery.data.meta.totalPages} (
              {activityQuery.data.meta.total} registros)
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(activityQuery.data.meta.totalPages, current + 1),
                )
              }
              disabled={page >= activityQuery.data.meta.totalPages}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
