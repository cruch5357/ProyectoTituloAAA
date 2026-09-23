import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useCreateProgram } from '../../api/programs';
import { ApiError } from '../../lib/apiClient';

// Diálogo de creación de programa (PROMPT 08). Mismo patrón exacto que
// ExerciseFormDialog.tsx (PROMPT 07): elemento nativo <dialog>, solo cubre
// CREACIÓN (la edición vive en ProgramDetailPage).
export function ProgramFormDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationWeeks, setDurationWeeks] = useState('');
  const createMutation = useCreateProgram();

  function resetForm() {
    setName('');
    setDescription('');
    setDurationWeeks('');
  }

  function openDialog() {
    resetForm();
    createMutation.reset();
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createMutation.mutateAsync({
        name,
        description: description.trim() || undefined,
        durationWeeks: durationWeeks ? Number(durationWeeks) : undefined,
      });
      closeDialog();
    } catch {
      // El error queda disponible en createMutation.error.
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog}>
        Nuevo programa
      </button>

      <dialog ref={dialogRef} className="invite-dialog">
        <form onSubmit={handleSubmit}>
          <h2>Nuevo programa</h2>

          <label className="field">
            <span>Nombre</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={createMutation.isPending}
            />
          </label>

          <label className="field">
            <span>Descripción (opcional)</span>
            <textarea
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={createMutation.isPending}
            />
          </label>

          <label className="field">
            <span>Duración en semanas (opcional)</span>
            <input
              type="number"
              min={1}
              value={durationWeeks}
              onChange={(event) => setDurationWeeks(event.target.value)}
              disabled={createMutation.isPending}
            />
          </label>

          {createMutation.isError && (
            <p role="alert" className="field-error">
              {createMutation.error instanceof ApiError
                ? createMutation.error.message
                : 'No se pudo crear el programa.'}
            </p>
          )}

          <div className="dialog-actions">
            <button
              type="submit"
              disabled={createMutation.isPending || name.trim().length === 0}
            >
              {createMutation.isPending ? 'Creando…' : 'Crear programa'}
            </button>
            <button type="button" onClick={closeDialog}>
              Cerrar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
