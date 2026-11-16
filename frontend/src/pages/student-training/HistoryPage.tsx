import { readableDate } from "../../lib/readableDate";
import { PersonalPerformance } from "../../components/ui/PersonalPerformance";
import {
  PeriodNavigator,
  Skeleton,
} from "../../components/ui/Primitives";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useWorkoutEvolution,
  useWorkoutLogsHistory,
} from "../../api/workoutLogs";
import { useMyProgramAssignments } from "../../api/programAssignments";
import { ApiError } from "../../lib/apiClient";
import {
  isWorkoutFinished,
  type WorkoutCompletionStatus,
} from "../../types/workoutLog";
import { WorkoutCompletionStatusBadge } from "./WorkoutCompletionStatusBadge";
import { EvolutionChart } from "../../components/ui/EvolutionChart";
import {
  formatWorkoutHistoryPeriod,
  groupWorkoutLogsByPeriod,
} from "./historyPeriods";

const STATUS_OPTIONS: { value: WorkoutCompletionStatus; label: string }[] = [
  { value: "COMPLETED", label: "Completado" },
  { value: "PARTIAL", label: "Parcial" },
  { value: "SKIPPED", label: "Omitido" },
];

function formatNumber(value: number | null, digits = 1): string {
  return value !== null ? value.toFixed(digits) : "—";
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [completionStatus, setCompletionStatus] = useState<
    WorkoutCompletionStatus | ""
  >("");
  const [programId, setProgramId] = useState("");

  const exerciseId = searchParams.get("exerciseId") ?? undefined;
  const exerciseName = searchParams.get("exerciseName") ?? undefined;

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
    ...commonFilters,
    completionStatus: completionStatus || undefined,
  });

  const historyPeriods = useMemo(
    () => groupWorkoutLogsByPeriod(historyQuery.data?.items ?? []),
    [historyQuery.data?.items],
  );
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(
    null,
  );
  const selectedPeriodIndex = Math.max(
    0,
    historyPeriods.findIndex((period) => period.key === selectedPeriodKey),
  );
  const selectedPeriod = historyPeriods[selectedPeriodIndex];

  const evolutionQuery = useWorkoutEvolution({
    ...commonFilters,
    exerciseId,
  });

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function clearExerciseFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("exerciseId");
    next.delete("exerciseName");
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
            onChange={(event) => {
              setCompletionStatus(
                event.target.value as WorkoutCompletionStatus | "",
              );
            }}
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
            <span>Ciclo</span>
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

      {evolutionQuery.isLoading && (
        <Skeleton label="Calculando tu evolución…" />
      )}

      {evolutionQuery.isError && (
        <p role="alert" className="field-error">
          {evolutionQuery.error instanceof ApiError
            ? evolutionQuery.error.message
            : "No se pudo calcular tu evolución."}
        </p>
      )}

      {evolutionQuery.isSuccess && (
        <>
          {evolutionQuery.data.summary.totalWorkouts === 0 && (
            <p>
              Todavía no tienes entrenamientos finalizados en este rango para
              calcular una evolución.
            </p>
          )}
          <PersonalPerformance
            summary={evolutionQuery.data.summary}
            recent={evolutionQuery.data.recentPerformance}
          />
          <p className="muted">
            Fatiga promedio (historial consultado):{" "}
            {formatNumber(evolutionQuery.data.summary.averageFatigue)} · Series
            registradas: {evolutionQuery.data.summary.totalSetLogs}
          </p>

          {exerciseId && (
            <div>
              <EvolutionChart
                points={evolutionQuery.data.exerciseEvolution ?? []}
              />
              <h3>
                Evolución de {exerciseName ?? "este ejercicio"}{" "}
                <button type="button" onClick={clearExerciseFilter}>
                  Quitar filtro
                </button>
              </h3>
              {(!evolutionQuery.data.exerciseEvolution ||
                evolutionQuery.data.exerciseEvolution.length === 0) && (
                <p>
                  Todavía no registraste series de este ejercicio en este rango.
                </p>
              )}
              {evolutionQuery.data.exerciseEvolution &&
                evolutionQuery.data.exerciseEvolution.length > 0 && (
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
                          <th>Series</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evolutionQuery.data.exerciseEvolution.map((point) => (
                          <tr key={point.workoutLogId}>
                            <td>{readableDate(point.performedAt, false)}</td>
                            <td>{point.maxActualLoad ?? "—"}</td>
                            <td>{point.totalActualReps ?? "—"}</td>
                            <td>{point.setCount}</td>
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

      <h2>Entrenamientos</h2>

      {historyQuery.isLoading && <Skeleton label="Cargando tu historial…" />}

      {historyQuery.isError && (
        <p role="alert" className="field-error">
          {historyQuery.error instanceof ApiError
            ? historyQuery.error.message
            : "No se pudo cargar tu historial."}
        </p>
      )}

      {historyQuery.isSuccess && historyPeriods.length === 0 && (
        <p>Todavía no tienes entrenamientos registrados con estos filtros.</p>
      )}

      {historyQuery.isSuccess && selectedPeriod && (
        <>
          <PeriodNavigator
            className="history-period-pagination"
            ariaLabel="Navegación por períodos del historial"
            label={
              <>
                <strong>{formatWorkoutHistoryPeriod(selectedPeriod)}</strong>
                <small>
                  {selectedPeriod.items.length} de {historyQuery.data.meta.total}{" "}
                  entrenamientos
                </small>
              </>
            }
            onPrevious={() =>
              setSelectedPeriodKey(
                historyPeriods[selectedPeriodIndex + 1]?.key ??
                  selectedPeriod.key,
              )
            }
            onNext={() =>
              setSelectedPeriodKey(
                historyPeriods[selectedPeriodIndex - 1]?.key ??
                  selectedPeriod.key,
              )
            }
            previousDisabled={
              selectedPeriodIndex >= historyPeriods.length - 1
            }
            nextDisabled={selectedPeriodIndex <= 0}
          />
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
                  <th>Sesión</th>
                  <th>Ciclo</th>
                  <th>Estado</th>
                  <th>Duración</th>
                  <th>Series</th>
                </tr>
              </thead>
              <tbody>
                {selectedPeriod.items.map((workoutLog) => (
                  <tr key={workoutLog.id}>
                    <td>
                      <Link to={`/workout-logs/${workoutLog.id}`}>
                        {readableDate(workoutLog.performedAt)}
                      </Link>
                    </td>
                    <td>{workoutLog.session?.name ?? "—"}</td>
                    <td>
                      {workoutLog.session?.week.block.program.name ?? "—"}
                    </td>
                    <td>
                      <WorkoutCompletionStatusBadge
                        status={workoutLog.completionStatus}
                      />{" "}
                      {!isWorkoutFinished(workoutLog) && "(en curso)"}
                    </td>
                    <td>
                      {workoutLog.durationMinutes !== null
                        ? `${workoutLog.durationMinutes} min`
                        : isWorkoutFinished(workoutLog)
                          ? "No disponible"
                          : "—"}
                    </td>
                    <td>{workoutLog.setLogsCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
