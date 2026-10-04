import { useId } from 'react';
import type {
  ExerciseEvolutionPoint,
  RecentPerformance,
} from '../../types/workoutEvolution';
import { EmptyState } from './Primitives';
export function EvolutionChart({
  points,
  effortPoints,
}: {
  points?: ExerciseEvolutionPoint[];
  effortPoints?: RecentPerformance['effortPoints'];
}) {
  const titleId = useId();
  const effort = effortPoints !== undefined;
  const data = (
    effortPoints
      ? effortPoints.map((point, index) => ({
          id: String(index),
          performedAt: point.performedAt,
          value: point.overallRpe,
        }))
      : (points ?? []).map((point) => ({
          id: point.workoutLogId,
          performedAt: point.performedAt,
          value: point.maxActualLoad,
        }))
  )
    .filter((p) => p.value !== null && Number.isFinite(p.value))
    .sort((a, b) => Date.parse(a.performedAt) - Date.parse(b.performedAt));
  if (data.length < 2)
    return (
      <EmptyState
        title="Más registros, más perspectiva"
        description="El gráfico de carga máxima aparecerá cuando existan al menos dos entrenamientos con carga registrada."
      />
    );
  const max = effort ? 10 : Math.max(...data.map((p) => p.value!)) || 1;
  // The existing registration contract also permits an explicitly measured 0.
  const min = effort && !data.some((point) => point.value === 0) ? 1 : 0;
  const start = Date.parse(data[0].performedAt);
  const span = Date.parse(data[data.length - 1].performedAt) - start;
  const x = (i: number) =>
    span
      ? 55 + ((Date.parse(data[i].performedAt) - start) / span) * 650
      : 55 + (i / (data.length - 1)) * 650;
  const y = (value: number) => 225 - ((value - min) / (max - min)) * 180;
  return (
    <figure className="chart">
      <figcaption>
        {effort
          ? `Esfuerzo percibido (RPE ${min}–10) · últimos 15 días`
          : 'Carga máxima registrada · por fecha'}
      </figcaption>
      <svg viewBox="0 0 760 280" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          {effort
            ? 'Esfuerzo por fecha. Valores exactos disponibles debajo del gráfico.'
            : 'Evolución de carga máxima. Valores exactos disponibles en la tabla.'}
        </title>
        {(effort ? [min, 5, 10] : [0, max / 2, max]).map((value) => (
          <g key={value}>
            <line
              className="chart-grid"
              x1="55"
              x2="705"
              y1={y(value)}
              y2={y(value)}
            />
            <text x="5" y={y(value) + 4}>
              {value.toFixed(1)}
            </text>
          </g>
        ))}
        <polyline
          points={data.map((p, i) => `${x(i)},${y(p.value!)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        {data.map((p, i) => (
          <circle
            key={p.id}
            cx={x(i)}
            cy={y(p.value!)}
            r="4"
            fill="currentColor"
          >
            <title>
              {new Date(p.performedAt).toLocaleDateString()}: {p.value}
            </title>
          </circle>
        ))}
        <text x="55" y="260">
          {new Date(data[0].performedAt).toLocaleDateString()}
        </text>
        <text x="705" y="260" textAnchor="end">
          {new Date(data[data.length - 1].performedAt).toLocaleDateString()}
        </text>
      </svg>
    </figure>
  );
}
