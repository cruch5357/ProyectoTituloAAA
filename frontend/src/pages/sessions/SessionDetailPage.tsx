import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession, useUpdateSession } from '../../api/sessions';
import {
  useSessionExercises,
  useCreateSessionExercise,
  useUpdateSessionExercise,
} from '../../api/sessionExercises';
import { useExercises } from '../../api/exercises';
import { ApiError } from '../../lib/apiClient';
import type { Session } from '../../types/session';
import type { SessionExercise } from '../../types/sessionExercise';

// Detalle + edición de una sesión propia, más la administración de sus
// ejercicios prescritos (PROMPT 08, "Integración con Exercise"): agrega
// ejercicios YA EXISTENTES del catálogo (api/exercises.ts, PROMPT 07) — esta
// pantalla nunca crea ejercicios nuevos, solo referencia el catálogo. No
// implementa ningún registro de ejecución real del alumno (WorkoutLog/
// SetLog), fuera de alcance de este prompt.
export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sessionQuery = useSession(id);

  if (sessionQuery.isLoading) {
    return <p>Cargando sesión…</p>;
  }

  if (sessionQuery.isError) {
    const message =
      sessionQuery.error instanceof ApiError
        ? sessionQuery.error.message
        : 'No se pudo cargar la sesión.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!sessionQuery.data) {
    return null;
  }

  return <SessionEditForm key={sessionQuery.data.id} session={sessionQuery.data} />;
}

function SessionEditForm({ session }: { session: Session }) {
  const updateMutation = useUpdateSession();
  const [name, setName] = useState(session.name);
  const [dayOfWeek, setDayOfWeek] = useState(
    session.dayOfWeek ? String(session.dayOfWeek) : '',
  );
  const [order, setOrder] = useState(String(session.order));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: session.id,
        payload: {
          name,
          dayOfWeek: dayOfWeek ? Number(dayOfWeek) : undefined,
          order: Number(order),
        },
      });
    } catch {
      // El error queda disponible en updateMutation.error.
    }
  }

  return (
    <section>
      <p>
        <Link to={`/weeks/${session.weekId}`}>← Volver a la semana</Link>
      </p>

      <h1>{session.name}</h1>

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
          <span>Día de la semana (1 = lunes … 7 = domingo, opcional)</span>
          <input
            type="number"
            min={1}
            max={7}
            value={dayOfWeek}
            onChange={(event) => setDayOfWeek(event.target.value)}
            disabled={updateMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Orden dentro de la semana</span>
          <input
            type="number"
            min={1}
            required
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            disabled={updateMutation.isPending}
          />
        </label>

        {updateMutation.isError && (
          <p role="alert" className="field-error">
            {updateMutation.error instanceof ApiError
              ? updateMutation.error.message
              : 'No se pudo guardar la sesión.'}
          </p>
        )}

        {updateMutation.isSuccess && <p role="status">Cambios guardados.</p>}

        <button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <SessionExercisesSection sessionId={session.id} />
    </section>
  );
}

function SessionExercisesSection({ sessionId }: { sessionId: string }) {
  const itemsQuery = useSessionExercises(sessionId);

  return (
    <section>
      <h2>Ejercicios de la sesión</h2>

      {itemsQuery.isLoading && <p>Cargando ejercicios…</p>}

      {itemsQuery.isSuccess && itemsQuery.data.length === 0 && (
        <p>Esta sesión todavía no tiene ejercicios prescritos.</p>
      )}

      {itemsQuery.isSuccess && itemsQuery.data.length > 0 && (
        <table className="students-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ejercicio</th>
              <th>Series</th>
              <th>Reps</th>
              <th>RPE</th>
              <th>RIR</th>
              <th>Descanso</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {itemsQuery.data.map((item) => (
              <SessionExerciseRow key={item.id} item={item} sessionId={sessionId} />
            ))}
          </tbody>
        </table>
      )}

      <AddSessionExerciseForm sessionId={sessionId} />
    </section>
  );
}

function SessionExerciseRow({
  item,
  sessionId,
}: {
  item: SessionExercise;
  sessionId: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <tr>
        <td>{item.order}</td>
        <td>
          {item.exercise.name}
          {!item.exercise.isActive && ' (inactivo)'}
        </td>
        <td>{item.targetSets ?? '—'}</td>
        <td>
          {item.targetRepsMin !== null && item.targetRepsMax !== null
            ? item.targetRepsMin === item.targetRepsMax
              ? item.targetRepsMin
              : `${item.targetRepsMin}-${item.targetRepsMax}`
            : '—'}
        </td>
        <td>{item.targetRpe ?? '—'}</td>
        <td>{item.targetRir ?? '—'}</td>
        <td>{item.restSeconds !== null ? `${item.restSeconds}s` : '—'}</td>
        <td>
          <button type="button" onClick={() => setEditing((current) => !current)}>
            {editing ? 'Cerrar' : 'Editar'}
          </button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={8}>
            <EditSessionExerciseForm
              item={item}
              sessionId={sessionId}
              onDone={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function EditSessionExerciseForm({
  item,
  sessionId,
  onDone,
}: {
  item: SessionExercise;
  sessionId: string;
  onDone: () => void;
}) {
  const updateMutation = useUpdateSessionExercise(sessionId);
  const [targetSets, setTargetSets] = useState(
    item.targetSets !== null ? String(item.targetSets) : '',
  );
  const [targetRepsMin, setTargetRepsMin] = useState(
    item.targetRepsMin !== null ? String(item.targetRepsMin) : '',
  );
  const [targetRepsMax, setTargetRepsMax] = useState(
    item.targetRepsMax !== null ? String(item.targetRepsMax) : '',
  );
  const [targetRpe, setTargetRpe] = useState(
    item.targetRpe !== null ? String(item.targetRpe) : '',
  );
  const [targetRir, setTargetRir] = useState(
    item.targetRir !== null ? String(item.targetRir) : '',
  );
  const [restSeconds, setRestSeconds] = useState(
    item.restSeconds !== null ? String(item.restSeconds) : '',
  );
  const [notes, setNotes] = useState(item.notes ?? '');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        payload: {
          targetSets: targetSets ? Number(targetSets) : undefined,
          targetRepsMin: targetRepsMin ? Number(targetRepsMin) : undefined,
          targetRepsMax: targetRepsMax ? Number(targetRepsMax) : undefined,
          targetRpe: targetRpe ? Number(targetRpe) : undefined,
          targetRir: targetRir ? Number(targetRir) : undefined,
          restSeconds: restSeconds ? Number(restSeconds) : undefined,
          notes: notes.trim() || undefined,
        },
      });
      onDone();
    } catch {
      // El error queda disponible en updateMutation.error.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="prescription-form">
      <label className="field">
        <span>Series</span>
        <input
          type="number"
          min={1}
          value={targetSets}
          onChange={(event) => setTargetSets(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Reps mín.</span>
        <input
          type="number"
          min={0}
          value={targetRepsMin}
          onChange={(event) => setTargetRepsMin(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Reps máx.</span>
        <input
          type="number"
          min={0}
          value={targetRepsMax}
          onChange={(event) => setTargetRepsMax(event.target.value)}
        />
      </label>
      <label className="field">
        <span>RPE (0-10)</span>
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={targetRpe}
          onChange={(event) => setTargetRpe(event.target.value)}
        />
      </label>
      <label className="field">
        <span>RIR</span>
        <input
          type="number"
          min={0}
          value={targetRir}
          onChange={(event) => setTargetRir(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Descanso (segundos)</span>
        <input
          type="number"
          min={0}
          value={restSeconds}
          onChange={(event) => setRestSeconds(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Notas</span>
        <input
          type="text"
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {updateMutation.isError && (
        <p role="alert" className="field-error">
          {updateMutation.error instanceof ApiError
            ? updateMutation.error.message
            : 'No se pudo guardar la prescripción.'}
        </p>
      )}

      <button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? 'Guardando…' : 'Guardar prescripción'}
      </button>
    </form>
  );
}

function AddSessionExerciseForm({ sessionId }: { sessionId: string }) {
  const exercisesQuery = useExercises({ page: 1, limit: 100 });
  const createMutation = useCreateSessionExercise(sessionId);

  const [exerciseId, setExerciseId] = useState('');
  const [targetSets, setTargetSets] = useState('');
  const [targetRepsMin, setTargetRepsMin] = useState('');
  const [targetRepsMax, setTargetRepsMax] = useState('');
  const [targetRpe, setTargetRpe] = useState('');
  const [targetRir, setTargetRir] = useState('');
  const [restSeconds, setRestSeconds] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setExerciseId('');
    setTargetSets('');
    setTargetRepsMin('');
    setTargetRepsMax('');
    setTargetRpe('');
    setTargetRir('');
    setRestSeconds('');
    setNotes('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createMutation.mutateAsync({
        exerciseId,
        targetSets: targetSets ? Number(targetSets) : undefined,
        targetRepsMin: targetRepsMin ? Number(targetRepsMin) : undefined,
        targetRepsMax: targetRepsMax ? Number(targetRepsMax) : undefined,
        targetRpe: targetRpe ? Number(targetRpe) : undefined,
        targetRir: targetRir ? Number(targetRir) : undefined,
        restSeconds: restSeconds ? Number(restSeconds) : undefined,
        notes: notes.trim() || undefined,
      });
      resetForm();
    } catch {
      // El error queda disponible en createMutation.error.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="prescription-form">
      <h3>Agregar ejercicio del catálogo</h3>

      <label className="field">
        <span>Ejercicio</span>
        <select
          required
          value={exerciseId}
          onChange={(event) => setExerciseId(event.target.value)}
          disabled={exercisesQuery.isLoading || createMutation.isPending}
        >
          <option value="">Selecciona un ejercicio…</option>
          {exercisesQuery.data?.items.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
              {exercise.muscleGroup ? ` (${exercise.muscleGroup})` : ''}
              {!exercise.isActive ? ' — inactivo' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Series</span>
        <input
          type="number"
          min={1}
          value={targetSets}
          onChange={(event) => setTargetSets(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Reps mín.</span>
        <input
          type="number"
          min={0}
          value={targetRepsMin}
          onChange={(event) => setTargetRepsMin(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Reps máx.</span>
        <input
          type="number"
          min={0}
          value={targetRepsMax}
          onChange={(event) => setTargetRepsMax(event.target.value)}
        />
      </label>
      <label className="field">
        <span>RPE (0-10)</span>
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={targetRpe}
          onChange={(event) => setTargetRpe(event.target.value)}
        />
      </label>
      <label className="field">
        <span>RIR</span>
        <input
          type="number"
          min={0}
          value={targetRir}
          onChange={(event) => setTargetRir(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Descanso (segundos)</span>
        <input
          type="number"
          min={0}
          value={restSeconds}
          onChange={(event) => setRestSeconds(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Notas</span>
        <input
          type="text"
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {createMutation.isError && (
        <p role="alert" className="field-error">
          {createMutation.error instanceof ApiError
            ? createMutation.error.message
            : 'No se pudo agregar el ejercicio.'}
        </p>
      )}

      <button
        type="submit"
        disabled={createMutation.isPending || exerciseId.length === 0}
      >
        {createMutation.isPending ? 'Agregando…' : 'Agregar ejercicio'}
      </button>
    </form>
  );
}
