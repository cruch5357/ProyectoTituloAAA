import { Link } from 'react-router-dom';
import { useTraining } from '../../api/training';
import { useSuggestedLoadHighlights } from '../../api/dashboard';
import type { SuggestedLoadHighlight } from '../../types/dashboard';
import { Skeleton } from '../../components/ui/Primitives';
import { StrengthSparkline } from '../../components/ui/StrengthSparkline';
import { SuggestionDetails } from '../../components/coaching/SuggestionDetails';

const number = (value: number, digits = 1) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: digits });
const shortDate = (iso: string) => {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
};

// Portada del atleta: estado del ciclo y cargas sugeridas por el modelo
// para sus ejercicios más entrenados, sin tener que elegir un ejercicio.
export function AthleteOverview({ studentId }: { studentId: string }) {
  return (
    <>
      <CycleSummary studentId={studentId} />
      <SuggestedLoadsPanel studentId={studentId} />
    </>
  );
}

function CycleSummary({ studentId }: { studentId: string }) {
  const query = useTraining(studentId);
  if (query.isLoading) return <Skeleton label="Cargando resumen…" />;
  if (!query.data) return null;
  const active = query.data.assignments.find((a) => a.status === 'ACTIVE');
  const week = active?.currentWeek;
  const thisWeek = week
    ? query.data.sessions.filter(
        (s) => s.assignmentId === active.id && s.weekNumber === week.weekNumber,
      )
    : [];
  const rate = active?.adherence.adherenceRate;
  const stats = [
    {
      label: 'Ciclo activo',
      value: active ? active.name : 'Sin ciclo activo',
      detail: active
        ? `${active.finishedSessions} de ${active.totalSessions} sesiones finalizadas`
        : 'Asígnale un bloque para comenzar',
    },
    {
      label: 'Semana actual',
      value: week ? `${week.weekNumber} de ${active!.weekCount}` : '—',
      detail: week
        ? `Hasta el ${shortDate(week.weekEnd)}`
        : 'Fuera del calendario',
    },
    {
      label: 'Esta semana',
      value: week
        ? `${thisWeek.filter((s) => s.finished).length} de ${thisWeek.length}`
        : '—',
      detail: 'sesiones realizadas',
    },
    {
      label: 'Adherencia',
      value: rate == null ? '—' : `${number(rate, 0)} %`,
      detail:
        rate == null
          ? 'Sin semanas cerradas aún'
          : `${active!.adherence.completedSessions} de ${active!.adherence.scheduledSessions} en semanas cerradas`,
    },
  ];
  return (
    <section
      className="athlete-overview"
      aria-labelledby="athlete-overview-title"
    >
      <h2 id="athlete-overview-title">Resumen general</h2>
      <dl className="athlete-overview__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="athlete-overview__stat">
            <dt>{stat.label}</dt>
            <dd>
              <strong>{stat.value}</strong>
              <span>{stat.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SuggestedLoadsPanel({ studentId }: { studentId: string }) {
  const query = useSuggestedLoadHighlights(studentId);
  // Si la función está desactivada no se muestra nada, como en la ficha.
  if (query.isLoading || !query.data?.enabled) return null;
  const { items } = query.data;
  const unavailable =
    items.length > 0 &&
    items.every((item) => item.suggestion.reason === 'service_unavailable');
  return (
    <section className="ml-highlights" aria-labelledby="ml-highlights-title">
      <header className="ml-highlights__header">
        <div>
          <p className="eyebrow">Modelo de carga sugerida</p>
          <h2 id="ml-highlights-title">Próxima sesión, según su progreso</h2>
          <p className="muted">
            Para sus ejercicios más entrenados, el modelo estima la fuerza (1RM)
            de cada sesión y propone la carga siguiente. Es un apoyo: la
            decisión final es del coach.
          </p>
        </div>
        <Link to={`/dashboard/students/${studentId}`}>Ver estadísticas →</Link>
      </header>
      {!items.length ? (
        <p className="muted">
          Aún no hay series con carga registradas para sugerir.
        </p>
      ) : unavailable ? (
        <p className="muted">
          El servicio de sugerencias no está disponible en este momento.
        </p>
      ) : (
        <ul className="ml-highlights__grid">
          {items.map((item) => (
            <li key={item.exerciseId}>
              <HighlightCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HighlightCard({ item }: { item: SuggestedLoadHighlight }) {
  const s = item.suggestion;
  const change = s.expectedChangePct ?? 0;
  const tone = change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
  return (
    <article
      className="ml-card"
      aria-label={`Carga sugerida de ${item.exerciseName}`}
    >
      <header className="ml-card__header">
        <h3>{item.exerciseName}</h3>
        <span>{item.sessions} sesiones</span>
      </header>
      {s.available ? (
        <>
          <p className="ml-card__value">
            <strong>{number(s.suggestedLoadKg ?? 0)} kg</strong> ×{' '}
            {s.targetReps} reps
          </p>
          <p className={`ml-card__change ml-card__change--${tone}`}>
            {tone === 'up' ? '▲' : tone === 'down' ? '▼' : '■'} 1RM estimado{' '}
            {number(s.lastE1rmKg ?? 0)} → {number(s.predictedE1rmKg ?? 0)} kg (
            {change > 0 ? '+' : ''}
            {number(change)} %)
          </p>
          <SuggestionDetails suggestion={s} />
        </>
      ) : (
        <p className="ml-card__pending">
          {s.reason === 'insufficient_history'
            ? `Necesita ${s.minSessions ?? 2} sesiones para sugerir (tiene ${s.basedOnSessions ?? item.sessions}).`
            : 'Sugerencia no disponible.'}
        </p>
      )}
      <StrengthSparkline
        values={item.trend.map((point) => point.e1rmKg)}
        predicted={s.available ? s.predictedE1rmKg : undefined}
      />
      {s.lastSession && (
        <p className="ml-card__last">
          Última: {number(s.lastSession.loadKg)} kg × {s.lastSession.reps} ·{' '}
          {shortDate(s.lastSession.date)}
        </p>
      )}
    </article>
  );
}
