import { useState } from 'react';
import {
  MUSCLE_GROUPS,
  SPORTS,
  findMuscleGroup,
} from '../../lib/exerciseTaxonomy';

// Selector de grupos musculares: un desplegable por grupo y un botón "+"
// para agregar otro. Mantiene internamente las filas (incluida una fila
// vacía recién agregada) y notifica al padre solo las claves elegidas. Para
// reiniciarlo, el padre lo vuelve a montar con otra `key`.
export function MuscleGroupPicker({
  initialValue,
  onChange,
  disabled,
}: {
  initialValue: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const [slots, setSlots] = useState<string[]>(
    initialValue.length > 0 ? initialValue : [''],
  );

  function update(next: string[]) {
    setSlots(next);
    onChange(next.filter(Boolean));
  }

  const canAdd =
    !disabled && slots.every(Boolean) && slots.length < MUSCLE_GROUPS.length;

  return (
    <fieldset className="muscle-picker" disabled={disabled}>
      <legend>Grupo muscular (opcional)</legend>
      {slots.map((slot, index) => (
        <div className="muscle-picker__row" key={index}>
          <select
            aria-label={`Grupo muscular ${index + 1}`}
            value={slot}
            onChange={(event) =>
              update(
                slots.map((s, i) => (i === index ? event.target.value : s)),
              )
            }
          >
            <option value="">Selecciona un grupo…</option>
            {MUSCLE_GROUPS.filter(
              (group) => group.key === slot || !slots.includes(group.key),
            ).map((group) => (
              <option key={group.key} value={group.key}>
                {group.label}
              </option>
            ))}
          </select>
          {(slots.length > 1 || slot) && (
            <button
              type="button"
              className="button--neutral muscle-picker__remove"
              aria-label={`Quitar ${findMuscleGroup(slot)?.label ?? `grupo ${index + 1}`}`}
              onClick={() => {
                const next = slots.filter((_, i) => i !== index);
                update(next.length > 0 ? next : ['']);
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button--neutral muscle-picker__add"
        onClick={() => setSlots([...slots, ''])}
        disabled={!canAdd}
      >
        + Agregar grupo muscular
      </button>
    </fieldset>
  );
}

// Columnas según cuántas imágenes haya: 1 grande; de 2 a 6 en 2 columnas
// (la 3.ª baja a una nueva fila y la 4.ª queda a su lado); 7 o más en 3
// columnas para que el panel no crezca demasiado en alto.
function columnsFor(count: number): number {
  if (count <= 1) return 1;
  if (count <= 6) return 2;
  return 3;
}

export function MuscleGroupPreview({ keys }: { keys: string[] }) {
  const groups = keys
    .map(findMuscleGroup)
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  if (groups.length === 0) {
    return (
      <div className="muscle-preview muscle-preview--empty">
        <p>
          Selecciona un grupo muscular para ver la zona que trabaja el
          ejercicio.
        </p>
      </div>
    );
  }

  return (
    <div
      className="muscle-preview"
      data-count={groups.length}
      style={{
        gridTemplateColumns: `repeat(${columnsFor(groups.length)}, minmax(0, 1fr))`,
      }}
      aria-label="Zonas musculares trabajadas"
    >
      {groups.map((group) => (
        <figure key={group.key} className="muscle-preview__item">
          <img src={group.image} alt={`Zona muscular: ${group.label}`} />
          <figcaption>
            <strong>{group.label}</strong>
            <span>{group.detail}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

// Deportes opcionales como botones de selección múltiple.
export function SportPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="sport-picker" disabled={disabled}>
      <legend>Deporte (opcional)</legend>
      <div className="sport-picker__options">
        {SPORTS.map((sport) => {
          const selected = value.includes(sport.key);
          return (
            <button
              key={sport.key}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected
                    ? value.filter((key) => key !== sport.key)
                    : [...value, sport.key],
                )
              }
            >
              {sport.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
