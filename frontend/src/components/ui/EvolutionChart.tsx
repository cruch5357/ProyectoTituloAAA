import { useId } from 'react';
import type { ExerciseEvolutionPoint } from '../../types/workoutEvolution';
import { EmptyState } from './Primitives';
export function EvolutionChart({
  points,
}: {
  points: ExerciseEvolutionPoint[];
}) {
  const titleId = useId();
  const data = points
    .filter((p) => p.maxActualLoad !== null && Number.isFinite(p.maxActualLoad))
    .sort((a, b) => Date.parse(a.performedAt) - Date.parse(b.performedAt));
  if (data.length < 2)
    return (
      <EmptyState
        title="Más registros, más perspectiva"
        description="El gráfico de carga máxima aparecerá cuando existan al menos dos entrenamientos con carga registrada."
      />
    );
  const max = Math.max(...data.map((p) => p.maxActualLoad!)) || 1;
  const start = Date.parse(data[0].performedAt);
  const span = Date.parse(data[data.length - 1].performedAt) - start;
  const x = (i: number) =>
    span
      ? 55 + ((Date.parse(data[i].performedAt) - start) / span) * 650
      : 55 + (i / (data.length - 1)) * 650;
  const y = (value: number) => 225 - (value / max) * 180;
  return (
    <figure className="chart">
      <figcaption>Carga máxima registrada · por fecha</figcaption>
      <svg viewBox="0 0 760 280" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          Evolución de carga máxima. Valores exactos disponibles en la tabla.
        </title>
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line
              className="chart-grid"
              x1="55"
              x2="705"
              y1={y(max * ratio)}
              y2={y(max * ratio)}
            />
            <text x="5" y={y(max * ratio) + 4}>
              {(max * ratio).toFixed(1)}
            </text>
          </g>
        ))}
        <polyline
          points={data
            .map((p, i) => `${x(i)},${y(p.maxActualLoad!)}`)
            .join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        {data.map((p, i) => (
          <circle
            key={p.workoutLogId}
            cx={x(i)}
            cy={y(p.maxActualLoad!)}
            r="4"
            fill="currentColor"
          >
            <title>
              {new Date(p.performedAt).toLocaleDateString()}: {p.maxActualLoad}
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
