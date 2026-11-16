import { useStrengthProgress } from "../../api/training";
import type { StrengthProgressItem } from "../../api/training";
import { StrengthSparkline } from "../../components/ui/StrengthSparkline";

const number = (value: number) =>
  value.toLocaleString("es-CL", { maximumFractionDigits: 1 });
const shortDate = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
};
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)} %`;

// Progreso de fuerza del alumno y la previsión del modelo, para motivar sin
// prescribir: las cargas siguen siendo decisión del coach.
export function StrengthProgress() {
  const query = useStrengthProgress();
  // Es un complemento: ante cualquier respuesta inesperada no afecta el Inicio.
  const items = query.data?.items;
  if (!Array.isArray(items)) return null;
  return (
    <section
      className="strength-progress"
      aria-labelledby="strength-progress-title"
    >
      <p className="eyebrow">Calculado con tus registros</p>
      <h2 id="strength-progress-title">Tu progreso de fuerza</h2>
      {items.length ? (
        <ul className="strength-progress__grid">
          {items.map((item) => (
            <li key={item.exerciseId}>
              <ProgressCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          Registra al menos dos sesiones de un ejercicio con peso para ver cómo
          avanza tu fuerza.
        </p>
      )}
      <p className="strength-progress__note">
        La fuerza estimada (1RM) es el peso que podrías levantar una vez,
        calculado a partir de tus series. Tu coach define las cargas de cada
        sesión.
      </p>
    </section>
  );
}

function ProgressCard({ item }: { item: StrengthProgressItem }) {
  const tone =
    item.changePct > 0.05 ? "up" : item.changePct < -0.05 ? "down" : "flat";
  const forecast = item.forecast;
  return (
    <article
      className="strength-card"
      aria-label={`Progreso en ${item.exerciseName}`}
    >
      <header className="strength-card__header">
        <h3>{item.exerciseName}</h3>
        <span>
          {item.sessions} sesiones desde el {shortDate(item.since)}
        </span>
      </header>
      <p className={`strength-card__change strength-card__change--${tone}`}>
        <strong>{signed(item.changePct)}</strong> de fuerza estimada
      </p>
      <p className="strength-card__range">
        {number(item.firstE1rmKg)} → {number(item.lastE1rmKg)} kg de 1RM
      </p>
      <StrengthSparkline
        values={item.trend.map((point) => point.e1rmKg)}
        predicted={forecast?.predictedE1rmKg}
      />
      {forecast && (
        <p className="strength-card__forecast">
          {forecast.expectedChangePct > 0.05
            ? `Si mantienes el ritmo, el modelo prevé ${number(forecast.predictedE1rmKg)} kg en tu próxima sesión.`
            : forecast.expectedChangePct < -0.05
              ? `El modelo prevé ${number(forecast.predictedE1rmKg)} kg: prioriza descansar y una buena técnica.`
              : `El modelo prevé que mantengas ${number(forecast.predictedE1rmKg)} kg en tu próxima sesión.`}
        </p>
      )}
    </article>
  );
}
