import type { CalendarData } from '../../api/coaching';

export function Adherence({ assignments = [] }: { assignments: CalendarData['assignments'] }) {
  return <section aria-label="Adherencia del programa">
    <h2>Adherencia del programa</h2>
    <p className="muted">Porcentaje de sesiones programadas hasta hoy que fueron finalizadas.</p>
    {!assignments.length && <p>Sin programación suficiente</p>}
    {assignments.map((a) => <div key={a.id}>
      <strong>{a.name}</strong>
      {a.adherence?.adherenceRate == null ? <p>{a.adherence?.insufficientReason === 'legacy-history' ? 'Sin datos suficientes: el historial antiguo no distingue ciclos de asignación.' : 'Sin programación suficiente'}</p> : <p>{a.adherence.completedSessions} / {a.adherence.scheduledSessions} sesiones · <strong>{a.adherence.adherenceRate}%</strong></p>}
    </div>)}
  </section>;
}
