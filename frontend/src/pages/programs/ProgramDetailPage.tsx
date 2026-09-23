import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useProgram,
  useUpdateProgram,
  useUpdateProgramStatus,
} from '../../api/programs';
import { useBlocks, useCreateBlock } from '../../api/blocks';
import { ApiError } from '../../lib/apiClient';
import { ProgramStatusBadge } from './ProgramStatusBadge';
import type { Program } from '../../types/program';

// Detalle + edición de un programa propio, más la administración de sus
// bloques (PROMPT 08: "Program -> Block -> Week -> Session"). Estructura
// calcada de ExerciseDetailPage.tsx (PROMPT 07) para la carga/edición, con
// una sección adicional para navegar/crear el siguiente nivel de la
// jerarquía — mismo criterio en BlockDetailPage/WeekDetailPage/
// SessionDetailPage.
export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const programQuery = useProgram(id);

  if (programQuery.isLoading) {
    return <p>Cargando programa…</p>;
  }

  if (programQuery.isError) {
    const message =
      programQuery.error instanceof ApiError
        ? programQuery.error.message
        : 'No se pudo cargar el programa.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
        <Link to="/programs">Volver a mis programas</Link>
      </section>
    );
  }

  if (!programQuery.data) {
    return null;
  }

  return <ProgramEditForm key={programQuery.data.id} program={programQuery.data} />;
}

function ProgramEditForm({ program }: { program: Program }) {
  const updateMutation = useUpdateProgram();
  const updateStatusMutation = useUpdateProgramStatus();

  const [name, setName] = useState(program.name);
  const [description, setDescription] = useState(program.description ?? '');
  const [durationWeeks, setDurationWeeks] = useState(
    program.durationWeeks ? String(program.durationWeeks) : '',
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: program.id,
        payload: {
          name,
          description: description.trim() || undefined,
          durationWeeks: durationWeeks ? Number(durationWeeks) : undefined,
        },
      });
    } catch {
      // El error queda disponible en updateMutation.error.
    }
  }

  return (
    <section>
      <p>
        <Link to="/programs">← Volver a mis programas</Link>
      </p>

      <div className="page-header">
        <h1>{program.name}</h1>
        <ProgramStatusBadge isActive={program.isActive} />
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
          <span>Descripción (opcional)</span>
          <textarea
            maxLength={2000}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={updateMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Duración en semanas (opcional)</span>
          <input
            type="number"
            min={1}
            value={durationWeeks}
            onChange={(event) => setDurationWeeks(event.target.value)}
            disabled={updateMutation.isPending}
          />
        </label>

        {updateMutation.isError && (
          <p role="alert" className="field-error">
            {updateMutation.error instanceof ApiError
              ? updateMutation.error.message
              : 'No se pudo guardar el programa.'}
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
                id: program.id,
                isActive: !program.isActive,
              })
            }
            disabled={updateStatusMutation.isPending}
          >
            {program.isActive ? 'Archivar programa' : 'Activar programa'}
          </button>
        </div>
      </form>

      {updateStatusMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo actualizar el estado del programa.
        </p>
      )}

      <ProgramBlocksSection programId={program.id} />
    </section>
  );
}

function ProgramBlocksSection({ programId }: { programId: string }) {
  const blocksQuery = useBlocks(programId);
  const createBlockMutation = useCreateBlock(programId);
  const [name, setName] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createBlockMutation.mutateAsync({ name });
      setName('');
    } catch {
      // El error queda disponible en createBlockMutation.error.
    }
  }

  return (
    <section>
      <h2>Bloques</h2>

      {blocksQuery.isLoading && <p>Cargando bloques…</p>}

      {blocksQuery.isSuccess && blocksQuery.data.length === 0 && (
        <p>Este programa todavía no tiene bloques.</p>
      )}

      {blocksQuery.isSuccess && blocksQuery.data.length > 0 && (
        <ul className="nested-list">
          {blocksQuery.data.map((block) => (
            <li key={block.id}>
              <Link to={`/blocks/${block.id}`}>
                {block.order}. {block.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="inline-create-form">
        <label className="field">
          <span>Nombre del nuevo bloque</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={160}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={createBlockMutation.isPending}
          />
        </label>
        <button
          type="submit"
          disabled={createBlockMutation.isPending || name.trim().length === 0}
        >
          {createBlockMutation.isPending ? 'Agregando…' : 'Agregar bloque'}
        </button>
      </form>

      {createBlockMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo crear el bloque.
        </p>
      )}
    </section>
  );
}
