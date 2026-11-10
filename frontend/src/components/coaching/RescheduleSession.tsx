import { useRef, useState } from 'react';
import { useBackdropClose } from '../../lib/useBackdropClose';
import { displayDate, useCoachingMutation, type CalendarSession } from '../../api/coaching';

export function RescheduleSession({ session }: { session: CalendarSession }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(dialog);
  const [date, setDate] = useState(session.suggestedDate ?? session.date ?? '');
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
    <button type="button" aria-label={`Cambiar fecha sugerida de ${session.name}`} onClick={() => { setDate(session.suggestedDate ?? session.date ?? ''); setReason(''); mutation.reset(); dialog.current?.showModal(); }}>Cambiar sugerencia</button>
    {mutation.isSuccess && <p role="status">Fecha sugerida actualizada.</p>}
    <dialog ref={dialog} {...backdropClose} className="invite-dialog" aria-label={`Cambiar fecha sugerida de ${session.name}`}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h2>Cambiar fecha sugerida de {session.name}</h2>
        <p>Esta fecha orienta el calendario; la sesión puede realizarse cualquier día disponible de su semana.</p>
        <p>Fecha sugerida actual: {(session.suggestedDate ?? session.date) && displayDate((session.suggestedDate ?? session.date)!)}</p>
        <label className="field">Nueva fecha sugerida<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} disabled={mutation.isPending} /></label>
        <label className="field">Motivo (opcional)<textarea maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={mutation.isPending} /></label>
        {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={() => dialog.current?.close()}>Cancelar</button>
          {session.rescheduled && <button type="button" disabled={mutation.isPending} onClick={() => void save(true)}>Restablecer sugerencia</button>}
          <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando...' : 'Guardar sugerencia'}</button>
        </div>
      </form>
    </dialog>
  </>;
}
