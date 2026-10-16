import { ExerciseVideo } from '../../components/ui/ExerciseVideo';
import { parseExerciseVideo } from '../../lib/exerciseVideo';
import { useRef, useState } from 'react';
import { useBackdropClose } from '../../lib/useBackdropClose';
import type { FormEvent } from 'react';
import { useCreateExercise } from '../../api/exercises';
import { ApiError } from '../../lib/apiClient';
import {
  MuscleGroupPicker,
  MuscleGroupPreview,
  SportPicker,
} from '../../components/exercises/MuscleGroupPicker';

// Formulario de creación de ejercicio (PROMPT 07, "crear ejercicio"). Mismo
// patrón exacto que InviteStudentDialog.tsx (PROMPT 04): elemento nativo
// <dialog> en vez de una librería de modales, para no agregar una
// dependencia nueva solo para esto.
//
// Solo cubre CREACIÓN: la edición vive en ExerciseDetailPage (un ejercicio
// ya existente se edita en su propia página, no en este diálogo).
export function ExerciseFormDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(dialogRef);
  const [name, setName] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  // Cambia en cada apertura para remontar el selector con sus filas vacías.
  const [formKey, setFormKey] = useState(0);
  const [instructions, setInstructions] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const createMutation = useCreateExercise();

  function resetForm() {
    setName('');
    setMuscleGroups([]);
    setSports([]);
    setFormKey((key) => key + 1);
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
    if (videoUrl.trim() && !parseExerciseVideo(videoUrl)) return;
    try {
      await createMutation.mutateAsync({
        name,
        muscleGroups,
        sports,
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

      <dialog
        ref={dialogRef}
        {...backdropClose}
        className="invite-dialog exercise-dialog"
        aria-label="Nuevo ejercicio"
      >
        <form onSubmit={handleSubmit}>
          <h2>Nuevo ejercicio</h2>

          <div className="exercise-form-layout">
            <div className="exercise-form-layout__fields">
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

              <MuscleGroupPicker
                key={formKey}
                initialValue={[]}
                onChange={setMuscleGroups}
                disabled={createMutation.isPending}
              />

              <SportPicker
                value={sports}
                onChange={setSports}
                disabled={createMutation.isPending}
              />

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
                <span>Video demostrativo (opcional)</span>
                <input
                  type="url"
                  maxLength={500}
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  disabled={createMutation.isPending}
                />
              </label>

              <ExerciseVideo
                videoUrl={videoUrl.trim()}
                name={name || 'Ejercicio'}
                label="Vista previa"
              />
              <p className="muted">
                YouTube público o no listado, con reproducción embebida
                habilitada.
              </p>
            </div>
            <aside className="exercise-form-layout__preview">
              <MuscleGroupPreview keys={muscleGroups} />
            </aside>
          </div>
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
              disabled={
                createMutation.isPending ||
                name.trim().length === 0 ||
                (!!videoUrl.trim() && !parseExerciseVideo(videoUrl))
              }
            >
              {createMutation.isPending ? 'Creando…' : 'Crear ejercicio'}
            </button>
            <button
              type="button"
              className="button--neutral"
              onClick={closeDialog}
            >
              Cerrar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
