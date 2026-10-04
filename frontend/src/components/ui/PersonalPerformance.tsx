import { EvolutionChart } from './EvolutionChart';
import type {
  RecentPerformance,
  WorkoutSummaryMetrics,
} from '../../types/workoutEvolution';
import { StatCard } from './Primitives';

export function PersonalPerformance({
  summary,
  recent,
  registered,
}: {
  summary: WorkoutSummaryMetrics;
  recent?: RecentPerformance;
  registered?: number;
}) {
  const format = (value: number | null | undefined, unit: string) =>
    value == null ? 'Sin datos suficientes' : `${value.toFixed(1)} ${unit}`;
  return (
    <section aria-label="Rendimiento reciente">
      <h2>Rendimiento reciente</h2>
      <div className="stat-cards">
        <StatCard
          label="Entrenamientos registrados"
          value={
            recent?.workoutsRegistered ?? registered ?? 'Sin datos suficientes'
          }
        />
        <StatCard
          label="Entrenamientos finalizados"
          value={summary.totalWorkouts}
        />
        <StatCard
          label="Esfuerzo promedio · últimos 15 días"
          value={format(recent?.averageOverallRpe, '/ 10')}
        />
        <StatCard
          label="Frecuencia registrada"
          value={format(summary.trainingFrequencyPerWeek, 'sesiones / semana')}
        />
        <StatCard
          label="Duración promedio"
          value={format(summary.averageDurationMinutes, 'min')}
        />
        <StatCard
          label="Última actividad"
          value={
            recent?.lastActivityAt
              ? new Date(recent.lastActivityAt).toLocaleString()
              : 'Sin datos suficientes'
          }
        />
      </div>
      <p className="muted">
        Frecuencia y duración basadas en los entrenamientos finalizados del
        historial consultado. La frecuencia usa el intervalo entre el primero y
        el último (mínimo un día), con al menos dos registros. El esfuerzo usa
        solo el RPE general registrado en los últimos 15 días; no representa
        fatiga.
      </p>
      {recent && recent.effortPoints.length >= 2 && (
        <EffortChart points={recent.effortPoints} />
      )}
    </section>
  );
}
function EffortChart({
  points,
}: {
  points: RecentPerformance['effortPoints'];
}) {
  return (
    <div>
      <EvolutionChart effortPoints={points} />
      <details>
        <summary>Ver valores de esfuerzo</summary>
        <ul>
          {points.map((point, i) => (
            <li key={i}>
              {new Date(point.performedAt).toLocaleString()}: {point.overallRpe}{' '}
              / 10
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
