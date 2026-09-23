import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useCreateExercise } from '../../api/exercises';
import { ApiError } from '../../lib/apiClient';

// Formulario de creación de ejercicio (PROMPT 07, "crear ejercicio"). Mismo
// patrón exacto que InviteStudentDialog.tsx (PROMPT 04): elemento nativo
// <dialog> en vez de una librería de modales, para no agregar una
// dependencia nueva solo para esto.
//
// Solo cubre CREACIÓN: la edición vive en ExerciseDetailPage (un ejercicio
// ya existente se edita en su propia página, no en este diálogo).
export function ExerciseFormDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [instructions, setInstructions] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const createMutation = useCreateExercise();

  function resetForm() {
    setName('');
    setMuscleGroup('');
    setInstructions('');
    setVideoUrl('');
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
        muscleGroup: muscleGroup.trim() || undefined,
        instructions: instructions.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
      });
      closeDialog();
    } catch {
      // El error ya queda disponible en createMutation.error para
      // mostrarse en el render; no hay nada adicional que hacer acá.
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog}>
        Nuevo ejercicio
      </button>

      <dialog ref={dialogRef} className="invite-dialog">
        <form onSubmit={handleSubmit}>
          <h2>Nuevo ejercicio</h2>

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
            <span>Grupo muscular (opcional)</span>
            <input
              type="text"
              maxLength={60}
              value={muscleGroup}
              onChange={(event) => setMuscleGroup(event.target.value)}
              disabled={createMutation.isPending}
            />
          </label>

          <label className="field">
            <span>Indicaciones (opcional)</span>
            <textarea
              maxLength={2000}
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              disabled={createMutation.isPending}
            />
          </label>

          <label className="field">
            <span>Video/enlace (opcional)</span>
            <input
              type="url"
              maxLength={500}
              placeholder="https://…"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              disabled={createMutation.isPending}
            />
          </label>

          {createMutation.isError && (
            <p role="alert" className="field-error">
              {createMutation.error instanceof ApiError
                ? createMutation.error.message
                : 'No se pudo crear el ejercicio.'}
            </p>
          )}

          <div className="dialog-actions">
            <button
              type="submit"
              disabled={createMutation.isPending || name.trim().length === 0}
            >
              {createMutation.isPending ? 'Creando…' : 'Crear ejercicio'}
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
