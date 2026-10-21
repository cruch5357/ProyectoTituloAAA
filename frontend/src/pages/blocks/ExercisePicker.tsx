import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlockCatalog } from "../../api/blockLibrary";
import { apiClient } from "../../lib/apiClient";
import { ErrorState, Skeleton } from "../../components/ui/Primitives";
import {
  displayName,
  newId,
  newSet,
  type CatalogItem,
  type PlannedExercise,
} from "./library-model";

export function ExercisePicker({
  current,
  onSave,
  onClose,
}: {
  current?: PlannedExercise;
  onSave: (exercise: PlannedExercise) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const catalog = useBlockCatalog();
  const cache = useQueryClient();
  const [base, setBase] = useState<CatalogItem | undefined>(
    current
      ? { id: current.exerciseId, name: current.baseName, category: "" }
      : undefined,
  );
  const [modifiers, setModifiers] = useState(current?.modifiers ?? []);
  const [search, setSearch] = useState("");
  const [modifierSearch, setModifierSearch] = useState("");
  const [category, setCategory] = useState("General");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const create = useMutation({
    mutationFn: async (kind: "exercises" | "modifiers") => {
      const result = await apiClient.post<CatalogItem>(
        `/block-library/catalog/${kind}`,
        {
          name: (kind === "exercises" ? search : modifierSearch).trim(),
          category: category.trim(),
        },
      );
      if (kind === "exercises") setBase(result.data);
      else
        setModifiers((ms) =>
          ms.some((m) => m.id === result.data.id)
            ? ms
            : [
                ...ms,
                {
                  id: result.data.id,
                  name: result.data.name,
                  category: result.data.category,
                },
              ],
        );
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["block-catalog"] });
      void cache.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
  function choices(items: CatalogItem[], query: string, modifier: boolean) {
    const filtered = items.filter((i) =>
      i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
    return (
      <>
        {[...new Set(filtered.map((i) => i.category))].map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            <div className="picker-chips">
              {filtered
                .filter((i) => i.category === group)
                .map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    aria-pressed={
                      modifier
                        ? modifiers.some((m) => m.id === i.id)
                        : base?.id === i.id
                    }
                    onClick={() =>
                      modifier
                        ? setModifiers((ms) =>
                            ms.some((m) => m.id === i.id)
                              ? ms.filter((m) => m.id !== i.id)
                              : [
                                  ...ms,
                                  {
                                    id: i.id,
                                    name: i.name,
                                    category: i.category,
                                  },
                                ],
                          )
                        : setBase(i)
                    }
                  >
                    {i.name}
                  </button>
                ))}
            </div>
          </section>
        ))}
        {!filtered.length && (
          <p className="muted">
            Sin coincidencias. Puedes crear una opción abajo.
          </p>
        )}
      </>
    );
  }
  return (
    <dialog
      ref={dialog}
      className="exercise-picker"
      aria-label="Seleccionar ejercicio y modificadores"
      onCancel={onClose}
    >
      <header className="page-header">
        <h2>
          {base
            ? displayName({ baseName: base.name, modifiers })
            : "Seleccionar ejercicio"}
        </h2>
        <button type="button" className="button--neutral" onClick={onClose}>
          Cerrar
        </button>
      </header>
      <div className="picker-chips">
        {base && (
          <button onClick={() => setBase(undefined)}>{base.name} ×</button>
        )}
        {modifiers.map((m, i) => (
          <span key={m.id}>
            <button
              title="Quitar modificador"
              onClick={() =>
                setModifiers((ms) => ms.filter((x) => x.id !== m.id))
              }
            >
              {m.name} ×
            </button>
            {i > 0 && (
              <button
                title="Mover modificador a la izquierda"
                aria-label={`Mover ${m.name} a la izquierda`}
                onClick={() =>
                  setModifiers((ms) => {
                    const next = [...ms];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    return next;
                  })
                }
              >
                ←
              </button>
            )}
          </span>
        ))}
      </div>
      {catalog.isLoading && <Skeleton />}
      {catalog.isError && <ErrorState retry={() => void catalog.refetch()} />}
      <div className="picker-columns">
        <section>
          <label className="field">
            Buscar ejercicios
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="picker-options">
            {choices(catalog.data?.exercises ?? [], search, false)}
          </div>
          <button
            disabled={!search.trim() || !category.trim() || create.isPending}
            onClick={() => create.mutate("exercises")}
          >
            + Crear ejercicio «{search.trim() || "nombre"}»
          </button>
        </section>
        <section>
          <label className="field">
            Buscar modificadores
            <input
              type="search"
              value={modifierSearch}
              onChange={(e) => setModifierSearch(e.target.value)}
            />
          </label>
          <div className="picker-options">
            {choices(catalog.data?.modifiers ?? [], modifierSearch, true)}
          </div>
          <button
            disabled={
              !modifierSearch.trim() || !category.trim() || create.isPending
            }
            onClick={() => create.mutate("modifiers")}
          >
            + Crear modificador «{modifierSearch.trim() || "nombre"}»
          </button>
        </section>
      </div>
      <label className="field">
        Categoría para nuevas opciones
        <input
          list="modifier-categories"
          maxLength={60}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id="modifier-categories">
          <option>Equipamiento</option>
          <option>Tempo / ejecución</option>
          <option>Variantes</option>
          <option>General</option>
        </datalist>
      </label>
      {create.error && <p role="alert">{create.error.message}</p>}
      <div className="dialog-actions">
        <button
          disabled={!base || create.isPending}
          onClick={() => {
            if (base)
              onSave({
                id: current?.id ?? newId(),
                exerciseId: base.id,
                baseName: base.name,
                modifiers,
                notes: current?.notes ?? "",
                sets: current?.sets ?? [newSet()],
              });
          }}
        >
          Guardar ejercicio
        </button>
      </div>
    </dialog>
  );
}
