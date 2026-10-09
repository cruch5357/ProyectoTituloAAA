import { DuplicateButton } from './DuplicateButton';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBlocks } from '../../api/blocks';
import { useWeeks } from '../../api/weeks';
import { useSessions } from '../../api/sessions';
import { useSessionExercises } from '../../api/sessionExercises';
import { EmptyState, ErrorState, Skeleton } from '../ui/Primitives';
import type { SessionExercise } from '../../types/sessionExercise';

export function ExerciseCard({ item }: { item: SessionExercise }) {
  return (
    <article className="exercise-card">
      <h4>{item.exercise.name}</h4>
      <small className="muted">
        {item.exercise.muscleGroup ?? 'Prescripción del coach'}
      </small>
      <dl>
        <div>
          <dt>Series</dt>
          <dd>{item.targetSets ?? '—'}</dd>
        </div>
        <div>
          <dt>Repeticiones</dt>
          <dd>
            {item.targetRepsMin === item.targetRepsMax
              ? (item.targetRepsMin ?? '—')
              : `${item.targetRepsMin ?? '—'}–${item.targetRepsMax ?? '—'}`}
          </dd>
        </div>
        <div>
          <dt>RPE / RIR</dt>
          <dd>
            {item.targetRpe ?? '—'} / {item.targetRir ?? '—'}
          </dd>
        </div>
        <div>
          <dt>Descanso</dt>
          <dd>{item.restSeconds === null ? '—' : `${item.restSeconds}s`}</dd>
        </div>
        <div>
          <dt>Real</dt>
          <dd>—</dd>
        </div>
      </dl>
      {item.notes && <p className="muted">{item.notes}</p>}
    </article>
  );
}
export function ProgramBoard({ programId }: { programId: string }) {
  const query = useBlocks(programId);
  const [selected, setSelected] = useState('');
  const block = query.data?.find((b) => b.id === selected) ?? query.data?.[0];
  return (
    <section className="program-board">
      <div className="page-header">
        <div>
          <p className="eyebrow">Programa / Bloque / Semana / Sesión</p>
          <h2>Planificación</h2>
        </div>
      </div>
      {query.isLoading && <Skeleton label="Cargando planificación…" />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.isSuccess && !block && (
        <EmptyState
          title="Construye tu primer bloque"
          description="Agrega un bloque más abajo para organizar semanas y sesiones."
        />
      )}
      {block && (
        <>
          <div className="chips" aria-label="Seleccionar bloque">
            {query.data?.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={block.id === b.id}
                onClick={() => setSelected(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
          <Link className="button" to={`/blocks/${block.id}`}>
            Editar bloque y agregar semanas
          </Link>
          <WeeksBoard key={block.id} blockId={block.id} />
        </>
      )}
      <p className="muted">
        Prescripción común por ejercicio. La ejecución detallada del alumno aún
        no está disponible en esta vista.
      </p>
    </section>
  );
}
function WeeksBoard({ blockId }: { blockId: string }) {
  const query = useWeeks(blockId);
  if (query.isLoading) return <Skeleton label="Cargando semanas…" />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data?.length)
    return (
      <EmptyState
        title="Sin semanas"
        description="Agrega una semana desde la edición del bloque."
      />
    );
  return (
    <div className="weeks-board" aria-label="Semanas del bloque" tabIndex={0}>
      {query.data.map((week) => (
        <WeekColumn key={week.id} id={week.id} number={week.number} />
      ))}
    </div>
  );
}
function WeekColumn({ id, number }: { id: string; number: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="week-column">
      <p className="eyebrow">Semana {number}</p>
      <DuplicateButton kind="weeks" id={id} />
      <Link to={`/weeks/${id}`}>Editar semana y sesiones →</Link>
      <button
        className="week-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Ocultar sesiones' : 'Ver sesiones'}
      </button>
      {expanded && <WeekSessions id={id} />}
    </article>
  );
}
function WeekSessions({ id }: { id: string }) {
  const query = useSessions(id);
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data?.length) return <EmptyState title="Sin sesiones" />;
  return (
    <>
      {query.data.map((session) => (
        <SessionCard
          key={session.id}
          id={session.id}
          name={session.name}
          order={session.order}
        />
      ))}
    </>
  );
}
function SessionCard({
  id,
  name,
  order,
}: {
  id: string;
  name: string;
  order: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="session-card">
      <p className="eyebrow">Sesión {order}</p>
      <h3>{name}</h3>
      <DuplicateButton kind="sessions" id={id} />
      <Link to={`/sessions/${id}`}>Editar sesión / prescripción →</Link>
      <button
        className="week-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Ocultar ejercicios' : 'Ver ejercicios'}
      </button>
      {expanded && <SessionExercises id={id} />}
    </article>
  );
}
function SessionExercises({ id }: { id: string }) {
  const query = useSessionExercises(id);
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  return (
    <>
      {query.data?.map((item) => (
        <ExerciseCard key={item.id} item={item} />
      ))}
      {query.isSuccess && !query.data.length && (
        <EmptyState title="Sin ejercicios prescritos" />
      )}
    </>
  );
}
