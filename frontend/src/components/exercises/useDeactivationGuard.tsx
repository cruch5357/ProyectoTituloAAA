import { useRef, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { useBackdropClose } from '../../lib/useBackdropClose';
import type { Exercise } from '../../types/exercise';

interface PendingDeactivation {
  exercise: Exercise;
  // null = no se pudo comprobar en qué bloques se usa.
  blocks: { id: string; name: string }[] | null;
  proceed: () => void;
}

// Antes de desactivar un ejercicio consulta en qué bloques de la biblioteca
// se usa. Si está en alguno (o no se pudo comprobar), pide confirmación:
// esos bloques quedan desactivados (no asignables) hasta reemplazarlo.
// Reactivar no pide confirmación.
export function useDeactivationGuard() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(dialogRef);
  const [pending, setPending] = useState<PendingDeactivation | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  async function request(exercise: Exercise, proceed: () => void) {
    if (!exercise.isActive) {
      proceed();
      return;
    }
    setCheckingId(exercise.id);
    let blocks: PendingDeactivation['blocks'] = null;
    try {
      const res = await apiClient.get<{
        blocks: { id: string; name: string }[];
      }>(`/exercises/${exercise.id}/usage`);
      blocks = res.data.blocks;
    } catch {
      blocks = null;
    } finally {
      setCheckingId(null);
    }
    if (blocks && blocks.length === 0) {
      proceed();
      return;
    }
    setPending({ exercise, blocks, proceed });
    dialogRef.current?.showModal();
  }

  const close = () => dialogRef.current?.close();

  const dialog = (
    <dialog
      ref={dialogRef}
      {...backdropClose}
      className="invite-dialog"
      aria-label="Confirmar desactivación"
      onClose={() => setPending(null)}
    >
      {pending && (
        <>
          <h2>Desactivar «{pending.exercise.name}»</h2>
          {pending.blocks ? (
            <>
              <p>
                Este ejercicio se usa en{' '}
                {pending.blocks.length === 1
                  ? '1 bloque'
                  : `${pending.blocks.length} bloques`}
                :
              </p>
              <ul>
                {pending.blocks.map((block) => (
                  <li key={block.id}>{block.name}</li>
                ))}
              </ul>
              <p>
                {pending.blocks.length === 1
                  ? 'Ese bloque quedará'
                  : 'Esos bloques quedarán'}{' '}
                <strong>
                  desactivado{pending.blocks.length === 1 ? '' : 's'}
                </strong>{' '}
                y no se podrá{pending.blocks.length === 1 ? '' : 'n'} asignar a
                alumnos hasta que reemplaces el ejercicio por uno activo (o lo
                vuelvas a activar). Los alumnos que ya tienen el bloque asignado
                no se ven afectados.
              </p>
            </>
          ) : (
            <p>
              No se pudo comprobar si este ejercicio se usa en bloques. Si está
              en alguno, ese bloque quedará desactivado hasta que lo reemplaces
              por un ejercicio activo.
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="button--neutral" onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className="button--danger"
              onClick={() => {
                const { proceed } = pending;
                close();
                proceed();
              }}
            >
              Desactivar de todos modos
            </button>
          </div>
        </>
      )}
    </dialog>
  );

  return { request, checkingId, dialog };
}
