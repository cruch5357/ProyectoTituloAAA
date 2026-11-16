const number = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

// Fuerza estimada (1RM) por sesión y, punteado, el valor que prevé el modelo.
// Lo usan la portada del atleta (coach) y el Inicio del alumno.
export function StrengthSparkline({
  values,
  predicted,
}: {
  values: number[];
  predicted?: number;
}) {
  if (values.length < 2) return null;
  const all = predicted === undefined ? values : [...values, predicted];
  const min = Math.min(...all);
  const span = Math.max(Math.max(...all) - min, 1);
  const width = 240;
  const height = 64;
  const steps = values.length - (predicted === undefined ? 1 : 0);
  const x = (index: number) => 4 + (index * (width - 8)) / steps;
  const y = (value: number) =>
    height - 6 - ((value - min) / span) * (height - 12);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg
      className="strength-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Fuerza estimada en las últimas ${values.length} sesiones: de ${number(values[0])} a ${number(values[last])} kg${predicted === undefined ? '' : `; el modelo prevé ${number(predicted)} kg`}.`}
    >
      <polyline className="strength-sparkline__trend" points={line} />
      {predicted !== undefined && (
        <>
          <line
            className="strength-sparkline__forecast"
            x1={x(last)}
            y1={y(values[last])}
            x2={x(last + 1)}
            y2={y(predicted)}
          />
          <circle
            className="strength-sparkline__forecast-dot"
            cx={x(last + 1)}
            cy={y(predicted)}
            r="4"
          />
        </>
      )}
      <circle
        className="strength-sparkline__last-dot"
        cx={x(last)}
        cy={y(values[last])}
        r="3.5"
      />
    </svg>
  );
}
