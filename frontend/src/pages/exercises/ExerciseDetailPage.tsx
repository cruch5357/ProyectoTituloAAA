import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useExercise,
  useUpdateExercise,
  useUpdateExerciseStatus,
} from '../../api/exercises';
import { ApiError } from '../../lib/apiClient';
import { ExerciseStatusBadge } from './ExerciseStatusBadge';
import type { Exercise } from '../../types/exercise';

// Detalle + edición de un ejercicio propio (PROMPT 07, "editar ejercicio").
// Estructura calcada de StudentDetailPage.tsx (PROMPT 04) para la carga/
// error, pero a diferencia de esa página SÍ incluye un formulario de edición
// completo: RF-08 exige CRUD completo de ejercicios (a diferencia de
// PROMPT 04, donde la edición de perfil de alumno se dejó explícitamente
// fuera de alcance).
export function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const exerciseQuery = useExercise(id);

  if (exerciseQuery.isLoading) {
    return <p>Cargando ejercicio…</p>;
  }

  if (exerciseQuery.isError) {
    // El backend responde 404 tanto si el ejercicio no existe como si
    // pertenece a otro coach (nunca 403 — ver docs/security.md), igual que
    // StudentDetailPage.
    const message =
      exerciseQuery.error instanceof ApiError
        ? exerciseQuery.error.message
        : 'No se pudo cargar el ejercicio.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
        <Link to="/exercises">Volver al catálogo</Link>
      </section>
    );
  }

  if (!exerciseQuery.data) {
    return null;
  }

  // `key` fuerza a React a crear una instancia nueva de ExerciseEditForm
  // (y por lo tanto un useState fresco) cada vez que cambia el ejercicio
  // cargado, sin necesitar un useEffect que sincronice el formulario con la
  // query (evita el anti-patrón "setState dentro de un efecto").
  return <ExerciseEditForm key={exerciseQuery.data.id} exercise={exerciseQuery.data} />;
}

function ExerciseEditForm({ exercise }: { exercise: Exercise }) {
  const updateMutation = useUpdateExercise();
  const updateStatusMutation = useUpdateExerciseStatus();

  const [name, setName] = useState(exercise.name);
  const [muscleGroup, setMuscleGroup] = useState(exercise.muscleGroup ?? '');
  const [instructions, setInstructions] = useState(
    exercise.instructions ?? '',
  );
  const [videoUrl, setVideoUrl] = useState(exercise.videoUrl ?? '');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: exercise.id,
        payload: {
          name,
          muscleGroup: muscleGroup.trim() || undefined,
          instructions: instructions.trim() || undefined,
          videoUrl: videoUrl.trim() || undefined,
        },
      });
    } catch {
      // El error ya queda disponible en updateMutation.error para
      // mostrarse en el render.
    }
  }

  return (
    <section>
      <p>
        <Link to="/exercises">← Volver al catálogo</Link>
      </p>

      <div className="page-header">
        <h1>{exercise.name}</h1>
        <ExerciseStatusBadge isActive={exercise.isActive} />
      </div>

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Nombre</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={160}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={updateMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Grupo muscular (opcional)</span>
          <input
            type="text"
            maxLength={60}
            value={muscleGroup}
            onChange={(event) => setMuscleGroup(event.target.value)}
            disabled={updateMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Indicaciones (opcional)</span>
          <textarea
            maxLength={2000}
            rows={4}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={updateMutation.isPending}
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
            disabled={updateMutation.isPending}
          />
        </label>

        {updateMutation.isError && (
          <p role="alert" className="field-error">
            {updateMutation.error instanceof ApiError
              ? updateMutation.error.message
              : 'No se pudo guardar el ejercicio.'}
          </p>
        )}

        {updateMutation.isSuccess && <p role="status">Cambios guardados.</p>}

        <div className="dialog-actions">
          <button
            type="submit"
            disabled={updateMutation.isPending || name.trim().length === 0}
          >
            {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={() =>
              updateStatusMutation.mutate({
                id: exercise.id,
                isActive: !exercise.isActive,
              })
            }
            disabled={updateStatusMutation.isPending}
          >
            {exercise.isActive ? 'Desactivar ejercicio' : 'Activar ejercicio'}
          </button>
        </div>
      </form>

      {updateStatusMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo actualizar el estado del ejercicio.
        </p>
      )}
    </section>
  );
}
