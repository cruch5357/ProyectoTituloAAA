import { memo, useState } from "react";
import {
  cloneExercise,
  copyPrevious,
  displayName,
  move,
  newSet,
  type PlannedExercise,
  type PlannedSet,
  type Priority,
} from "./library-model";

export function OrderButtons({
  index,
  count,
  onMove,
  label,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  label: string;
}) {
  return (
    <span className="order-buttons">
      <button
        type="button"
        title={`Subir ${label}`}
        aria-label={`Subir ${label}`}
        disabled={!index}
        onClick={() => onMove(index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        title={`Bajar ${label}`}
        aria-label={`Bajar ${label}`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        ↓
      </button>
    </span>
  );
}
export function DragHandle({ id, kind }: { id: string; kind: string }) {
  return (
    <span
      className="drag-handle"
      draggable
      title="Arrastrar para reordenar; también puedes usar las flechas"
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", `${kind}:${id}`);
        e.dataTransfer.effectAllowed = "move";
      }}
      aria-hidden="true"
    >
      ⠿
    </span>
  );
}
const priorities: Priority[] = ["low", "medium", "high"];
const priorityLabels = {
  low: "Baja (verde)",
  medium: "Media (amarilla)",
  high: "Alta (roja)",
};
const SetRow = memo(function SetRow({
  set,
  index,
  count,
  onChange,
  onCopy,
  onDelete,
  onMove,
  onDrop,
}: {
  set: PlannedSet;
  index: number;
  count: number;
  onChange: (s: PlannedSet) => void;
  onCopy: () => void;
  onDelete: () => void;
  onMove: (to: number) => void;
  onDrop: (id: string) => void;
}) {
  return (
    <div
      className="set-row"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const value = e.dataTransfer.getData("text/plain");
        if (value.startsWith("set:")) {
          e.preventDefault();
          e.stopPropagation();
          onDrop(value.slice(4));
        }
      }}
    >
      <button
        type="button"
        className={`set-priority priority-${set.priority}`}
        title={`Prioridad ${priorityLabels[set.priority]}. Pulsar para cambiar.`}
        aria-label={`Serie ${index + 1}: prioridad ${priorityLabels[set.priority]}`}
        onClick={() =>
          onChange({
            ...set,
            priority: priorities[(priorities.indexOf(set.priority) + 1) % 3],
          })
        }
      >
        <span />
      </button>
      {(["weight", "reps", "rpe"] as const).map((field) => (
        <input
          key={`${set.id}-${field}-${set[field]}`}
          type="number"
          aria-label={`${field === "weight" ? "Peso" : field === "reps" ? "Reps" : "RPE"} serie ${index + 1}`}
          min={0}
          max={field === "rpe" ? 10 : field === "weight" ? 9999.99 : 10000}
          step={field === "weight" ? 0.01 : field === "rpe" ? 0.1 : 1}
          defaultValue={set[field] ?? ""}
          onBlur={(e) => {
            if (e.target.validity.valid)
              onChange({
                ...set,
                [field]: e.target.value === "" ? null : Number(e.target.value),
              });
            else e.target.reportValidity();
          }}
        />
      ))}
      <div className="set-tools">
        <button
          type="button"
          title="Copiar valores de la serie anterior"
          aria-label={`Copiar serie anterior a ${index + 1}`}
          disabled={!index}
          onClick={onCopy}
        >
          ↳
        </button>
        <button
          type="button"
          title="Eliminar serie"
          aria-label={`Eliminar serie ${index + 1}`}
          onClick={onDelete}
        >
          ×
        </button>
        <DragHandle id={set.id} kind="set" />
        <OrderButtons
          label={`serie ${index + 1}`}
          index={index}
          count={count}
          onMove={onMove}
        />
      </div>
    </div>
  );
});
export const ExerciseEditor = memo(function ExerciseEditor({
  exercise: e,
  index,
  count,
  onChange,
  onDuplicate,
  onDelete,
  onEdit,
  onMove,
  onDrop,
}: {
  exercise: PlannedExercise;
  index: number;
  count: number;
  onChange: (e: PlannedExercise) => void;
  onDuplicate: (e: PlannedExercise) => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: (to: number) => void;
  onDrop: (id: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <article
      className="planned-exercise"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const value = event.dataTransfer.getData("text/plain");
        if (value.startsWith("exercise:")) onDrop(value.slice(9));
      }}
    >
      <header>
        <DragHandle id={e.id} kind="exercise" />
        <button
          type="button"
          className="exercise-name"
          onClick={onEdit}
          title="Editar ejercicio y modificadores"
        >
          {displayName(e)}
        </button>
        <OrderButtons
          label="ejercicio"
          index={index}
          count={count}
          onMove={onMove}
        />
      </header>
      <div className="exercise-actions">
        <button type="button" onClick={() => onDuplicate(cloneExercise(e))}>
          Duplicar
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`¿Eliminar ${displayName(e)} y sus series?`))
              onDelete();
          }}
        >
          Eliminar
        </button>
      </div>
      <div className="set-head">
        <span>#</span>
        <span>Peso</span>
        <span>Reps</span>
        <span>RPE</span>
        <span>Acciones</span>
      </div>
      {e.sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          index={i}
          count={e.sets.length}
          onChange={(next) =>
            onChange({
              ...e,
              sets: e.sets.map((x) => (x.id === s.id ? next : x)),
            })
          }
          onCopy={() => onChange({ ...e, sets: copyPrevious(e.sets, i) })}
          onDelete={() =>
            onChange({ ...e, sets: e.sets.filter((x) => x.id !== s.id) })
          }
          onMove={(to) => onChange({ ...e, sets: move(e.sets, i, to) })}
          onDrop={(id) =>
            onChange({
              ...e,
              sets: move(
                e.sets,
                e.sets.findIndex((x) => x.id === id),
                i,
              ),
            })
          }
        />
      ))}
      <footer>
        <button
          type="button"
          onClick={() => onChange({ ...e, sets: [...e.sets, newSet()] })}
        >
          + Añadir serie
        </button>
        <button
          type="button"
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen((v) => !v)}
        >
          {e.notes ? "Nota •" : "Nota"}
        </button>
      </footer>
      {noteOpen && (
        <label className="field">
          Nota del ejercicio
          <textarea
            rows={2}
            maxLength={2000}
            defaultValue={e.notes}
            onBlur={(event) => onChange({ ...e, notes: event.target.value })}
          />
        </label>
      )}
    </article>
  );
});
