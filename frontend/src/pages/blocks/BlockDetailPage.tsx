import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBlock, useUpdateBlock } from '../../api/blocks';
import { useWeeks, useCreateWeek } from '../../api/weeks';
import { ApiError } from '../../lib/apiClient';
import type { Block } from '../../types/block';

// Detalle + edición de un bloque propio, más la administración de sus
// semanas. Mismo criterio exacto que ProgramDetailPage.tsx.
export function BlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const blockQuery = useBlock(id);

  if (blockQuery.isLoading) {
    return <p>Cargando bloque…</p>;
  }

  if (blockQuery.isError) {
    const message =
      blockQuery.error instanceof ApiError
        ? blockQuery.error.message
        : 'No se pudo cargar el bloque.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!blockQuery.data) {
    return null;
  }

  return <BlockEditForm key={blockQuery.data.id} block={blockQuery.data} />;
}

function BlockEditForm({ block }: { block: Block }) {
  const updateMutation = useUpdateBlock();
  const [name, setName] = useState(block.name);
  const [order, setOrder] = useState(String(block.order));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: block.id,
        payload: { name, order: Number(order) },
      });
    } catch {
      // El error queda disponible en updateMutation.error.
    }
  }

  return (
    <section>
      <p>
        <Link to={`/programs/${block.programId}`}>← Volver al programa</Link>
      </p>

      <h1>{block.name}</h1>

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
          <span>Orden dentro del programa</span>
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
              : 'No se pudo guardar el bloque.'}
          </p>
        )}

        {updateMutation.isSuccess && <p role="status">Cambios guardados.</p>}

        <button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <BlockWeeksSection blockId={block.id} />
    </section>
  );
}

function BlockWeeksSection({ blockId }: { blockId: string }) {
  const weeksQuery = useWeeks(blockId);
  const createWeekMutation = useCreateWeek(blockId);
  const [number, setNumber] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createWeekMutation.mutateAsync({ number: Number(number) });
      setNumber('');
    } catch {
      // El error queda disponible en createWeekMutation.error.
    }
  }

  return (
    <section>
      <h2>Semanas</h2>

      {weeksQuery.isLoading && <p>Cargando semanas…</p>}

      {weeksQuery.isSuccess && weeksQuery.data.length === 0 && (
        <p>Este bloque todavía no tiene semanas.</p>
      )}

      {weeksQuery.isSuccess && weeksQuery.data.length > 0 && (
        <ul className="nested-list">
          {weeksQuery.data.map((week) => (
            <li key={week.id}>
              <Link to={`/weeks/${week.id}`}>Semana {week.number}</Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="inline-create-form">
        <label className="field">
          <span>Número de la nueva semana</span>
          <input
            type="number"
            min={1}
            required
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            disabled={createWeekMutation.isPending}
          />
        </label>
        <button
          type="submit"
          disabled={createWeekMutation.isPending || number.trim().length === 0}
        >
          {createWeekMutation.isPending ? 'Agregando…' : 'Agregar semana'}
        </button>
      </form>

      {createWeekMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo crear la semana.
        </p>
      )}
    </section>
  );
}
