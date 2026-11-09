import type { CalendarData } from '../../api/coaching';
import { todayDate } from '../../lib/calendarDate';

function startDateDetails(value: string | null, today: string) {
  const start = value?.slice(0, 10) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(todayTime)) return null;
  const differenceInDays = Math.floor((todayTime - startTime) / 86400000);
  const exactDate = new Date(`${start}T12:00:00Z`).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    ...(start.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  });
  if (differenceInDays < 0) return { exactDate, age: 'Aún no comienza' };
  if (differenceInDays === 0) return { exactDate, age: 'Comenzó hoy' };
  if (differenceInDays < 7) return { exactDate, age: `Hace ${differenceInDays} ${differenceInDays === 1 ? 'día' : 'días'}` };
  const weeks = Math.floor(differenceInDays / 7);
  return { exactDate, age: `Hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}` };
}

const percentage = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

export function Adherence({ assignments = [], today = todayDate() }: { assignments: CalendarData['assignments']; today?: string }) {
  return <section aria-label="Adherencia del programa">
    <h2>Adherencia del programa</h2>
    <p className="muted">Porcentaje de sesiones programadas hasta hoy que fueron finalizadas.</p>
    {!assignments.length && <p>Sin programación suficiente</p>}
    <div className="adherence-list">
      {assignments.map((a) => {
        const start = startDateDetails(a.startDate, today);
        return <article className="adherence-card" key={a.id}>
          <strong>{a.name}</strong>
          {start
            ? <p className="adherence-card__start">Inicio del bloque: <time dateTime={a.startDate?.slice(0, 10)}>{start.exactDate}</time> · <strong>{start.age}</strong></p>
            : <p className="adherence-card__start">Inicio del bloque: <strong>No disponible</strong></p>}
          {a.adherence?.adherenceRate == null
            ? <p>{a.adherence?.insufficientReason === 'legacy-history' ? 'Sin datos suficientes: el historial antiguo no distingue ciclos de asignación.' : 'Sin programación suficiente'}</p>
            : <>
              <p className="adherence-card__rate"><strong>{percentage.format(a.adherence.adherenceRate)} % de adherencia</strong></p>
              <ul className="adherence-breakdown" aria-label="Resumen de estados de las sesiones">
                <li className="adherence-breakdown--success"><span aria-hidden="true" />{a.adherence.fullyCompletedSessions ?? a.adherence.completedSessions} completadas</li>
                <li className="adherence-breakdown--danger"><span aria-hidden="true" />{a.adherence.skippedSessions ?? 0} omitidas</li>
                <li className="adherence-breakdown--danger"><span aria-hidden="true" />{a.adherence.expiredPartialSessions ?? 0} parciales vencidas</li>
                <li className="adherence-breakdown--neutral"><span aria-hidden="true" />{a.adherence.actionableSessions ?? 0} disponibles hoy o futuras</li>
              </ul>
              <p>{a.adherence.completedSessions} de {a.adherence.scheduledSessions} sesiones programadas hasta hoy.</p>
            </>}
        </article>;
      })}
    </div>
  </section>;
}
