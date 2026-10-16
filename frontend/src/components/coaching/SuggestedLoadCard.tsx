import { useState } from 'react';
import { useSuggestedLoad } from '../../api/dashboard';

function kg(value: number | undefined): string {
  return value === undefined
    ? '—'
    : `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg`;
}

function formatPct(value: number | undefined): string {
  const pct = value ?? 0;
  return `${pct > 0 ? '+' : ''}${pct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

// Carga sugerida para la próxima sesión (modelo de data-science/). Se
// muestra solo al coach, como apoyo: él decide qué prescribir. Si la función
// está desactivada no se muestra nada.
export function SuggestedLoadCard({
  studentId,
  exerciseId,
}: {
  studentId: string;
  exerciseId: string;
}) {
  const [targetReps, setTargetReps] = useState<number | undefined>(undefined);
  const query = useSuggestedLoad(studentId, exerciseId, targetReps);
  const data = query.data;

  if (query.isLoading || !data || data.reason === 'disabled') return null;

  return (
    <section className="card suggested-load" aria-label="Carga sugerida">
      <h2>Carga sugerida para la próxima sesión</h2>

      {data.reason === 'service_unavailable' && (
        <p className="muted">
          El servicio de sugerencias no está disponible en este momento.
        </p>
      )}

      {data.reason === 'insufficient_history' && (
        <p className="muted">
          Se necesitan al menos {data.minSessions ?? 2} sesiones registradas de
          este ejercicio para sugerir una carga
          {data.basedOnSessions !== undefined
            ? ` (hay ${data.basedOnSessions})`
            : ''}
          .
        </p>
      )}

      {data.available && (
        <>
          <div className="suggested-load__main">
            <p className="suggested-load__value">
              <strong>{kg(data.suggestedLoadKg)}</strong> × {data.targetReps}{' '}
              reps
            </p>
            <label className="field suggested-load__reps">
              <span>Repeticiones</span>
              <input
                type="number"
                min={1}
                max={15}
                value={targetReps ?? data.targetReps ?? 8}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (value >= 1 && value <= 15) setTargetReps(value);
                }}
              />
            </label>
          </div>
          <p className="muted">
            {data.lastSession &&
              `Última sesión: ${kg(data.lastSession.loadKg)} × ${data.lastSession.reps} (${shortDate(data.lastSession.date)}). `}
            Fuerza estimada (1RM): {kg(data.lastE1rmKg)} →{' '}
            {kg(data.predictedE1rmKg)} ({formatPct(data.expectedChangePct)}).
            Basado en {data.basedOnSessions} sesiones.
          </p>
          <p className="muted suggested-load__note">
            Sugerencia del modelo como apoyo: la decisión final es del coach.
          </p>
        </>
      )}
    </section>
  );
}
