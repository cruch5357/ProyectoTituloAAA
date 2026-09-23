import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWeek, useUpdateWeek } from '../../api/weeks';
import { useSessions, useCreateSession } from '../../api/sessions';
import { ApiError } from '../../lib/apiClient';
import type { Week } from '../../types/week';

// Detalle + edición de una semana propia, más la administración de sus
// sesiones. Mismo criterio exacto que BlockDetailPage.tsx.
export function WeekDetailPage() {
  const { id } = useParams<{ id: string }>();
  const weekQuery = useWeek(id);

  if (weekQuery.isLoading) {
    return <p>Cargando semana…</p>;
  }

  if (weekQuery.isError) {
    const message =
      weekQuery.error instanceof ApiError
        ? weekQuery.error.message
        : 'No se pudo cargar la semana.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!weekQuery.data) {
    return null;
  }

  return <WeekEditForm key={weekQuery.data.id} week={weekQuery.data} />;
}

function WeekEditForm({ week }: { week: Week }) {
  const updateMutation = useUpdateWeek();
  const [number, setNumber] = useState(String(week.number));
  const [order, setOrder] = useState(String(week.order));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: week.id,
        payload: { number: Number(number), order: Number(order) },
      });
    } catch {
      // El error queda disponible en updateMutation.error.
    }
  }

  return (
    <section>
      <p>
        <Link to={`/blocks/${week.blockId}`}>← Volver al bloque</Link>
      </p>

      <h1>Semana {week.number}</h1>

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Número visible</span>
          <input
            type="number"
            min={1}
            required
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            disabled={updateMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Orden dentro del bloque</span>
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
              : 'No se pudo guardar la semana.'}
          </p>
        )}

        {updateMutation.isSuccess && <p role="status">Cambios guardados.</p>}

        <button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <WeekSessionsSection weekId={week.id} />
    </section>
  );
}

function WeekSessionsSection({ weekId }: { weekId: string }) {
  const sessionsQuery = useSessions(weekId);
  const createSessionMutation = useCreateSession(weekId);
  const [name, setName] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createSessionMutation.mutateAsync({ name });
      setName('');
    } catch {
      // El error queda disponible en createSessionMutation.error.
    }
  }

  return (
    <section>
      <h2>Sesiones</h2>

      {sessionsQuery.isLoading && <p>Cargando sesiones…</p>}

      {sessionsQuery.isSuccess && sessionsQuery.data.length === 0 && (
        <p>Esta semana todavía no tiene sesiones.</p>
      )}

      {sessionsQuery.isSuccess && sessionsQuery.data.length > 0 && (
        <ul className="nested-list">
          {sessionsQuery.data.map((session) => (
            <li key={session.id}>
              <Link to={`/sessions/${session.id}`}>
                {session.order}. {session.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="inline-create-form">
        <label className="field">
          <span>Nombre de la nueva sesión</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={160}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={createSessionMutation.isPending}
          />
        </label>
        <button
          type="submit"
          disabled={
            createSessionMutation.isPending || name.trim().length === 0
          }
        >
          {createSessionMutation.isPending ? 'Agregando…' : 'Agregar sesión'}
        </button>
      </form>

      {createSessionMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo crear la sesión.
        </p>
      )}
    </section>
  );
}
