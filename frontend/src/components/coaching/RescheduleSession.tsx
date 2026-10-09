import { useRef, useState } from 'react';
import { displayDate, useCoachingMutation, type CalendarSession } from '../../api/coaching';

export function RescheduleSession({ session }: { session: CalendarSession }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(session.date ?? '');
  const [reason, setReason] = useState('');
  const mutation = useCoachingMutation();
  const path = `/program-assignments/${session.assignmentId}/sessions/${session.sessionId}/schedule`;
  async function save(reset = false) {
    try {
      await mutation.mutateAsync(reset ? { path: `${path}/reset`, method: 'post' } : { path, data: { scheduledDate: date, reason: reason.trim() || undefined } });
      dialog.current?.close();
    } catch { /* Error displayed in dialog. */ }
  }
  return <>
    <button type="button" aria-label={`Reprogramar ${session.name}`} onClick={() => { setDate(session.date ?? ''); setReason(''); mutation.reset(); dialog.current?.showModal(); }}>Reprogramar</button>
    {mutation.isSuccess && <p role="status">Programación actualizada.</p>}
    <dialog ref={dialog} className="invite-dialog" aria-label={`Reprogramar ${session.name}`}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h2>Reprogramar {session.name}</h2>
        <p>Fecha actual: {session.date && displayDate(session.date)}</p>
        <label className="field">Nueva fecha<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} disabled={mutation.isPending} /></label>
        <label className="field">Motivo (opcional)<textarea maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={mutation.isPending} /></label>
        {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={() => dialog.current?.close()}>Cancelar</button>
          {session.rescheduled && <button type="button" disabled={mutation.isPending} onClick={() => void save(true)}>Restablecer programación</button>}
          <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Reprogramando...' : 'Reprogramar'}</button>
        </div>
      </form>
    </dialog>
  </>;
}
