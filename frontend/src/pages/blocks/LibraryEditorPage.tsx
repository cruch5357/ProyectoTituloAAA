import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  libraryKey,
  useFolders,
  useLibraryBlock,
} from "../../api/blockLibrary";
import { apiClient } from "../../lib/apiClient";
import { ErrorState, Skeleton } from "../../components/ui/Primitives";
import {
  addDay,
  cloneDay,
  cloneWeek,
  move,
  newId,
  savePayload,
  type LibraryBlock,
  type PlannedExercise,
  type PlannedWeek,
} from "./library-model";
import { ExerciseEditor, OrderButtons } from "./ExerciseEditor";
import { ExercisePicker } from "./ExercisePicker";
import "./library.css";

export function LibraryEditorPage() {
  const { id = "" } = useParams();
  const query = useLibraryBlock(id);
  if (query.isLoading) return <Skeleton label="Cargando bloque…" />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        retry={() => void query.refetch()}
      />
    );
  return query.data ? (
    <LibraryEditor key={query.data.id} initial={query.data} />
  ) : null;
}
function LibraryEditor({ initial }: { initial: LibraryBlock }) {
  const [block, setBlock] = useState(initial);
  const latest = useRef(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeWeek, setActiveWeek] = useState(0);
  const busy = useRef(false);
  const [picker, setPicker] = useState<{
    week: string;
    day: string;
    current?: PlannedExercise;
  }>();
  const folders = useFolders();
  const cache = useQueryClient();
  const blocker = useBlocker(dirty || saving);
  useEffect(() => {
    if (!dirty && !saving) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, saving]);
  function change(next: LibraryBlock) {
    latest.current = next;
    setBlock(next);
    setDirty(true);
    setError("");
  }
  function changeWeek(id: string, next: PlannedWeek) {
    change({
      ...block,
      weeks: block.weeks.map((w) => (w.id === id ? next : w)),
    });
  }
  async function save() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await apiClient.patch<LibraryBlock>(
        `/block-library/${block.id}`,
        savePayload(latest.current),
      );
      setBlock(result.data);
      latest.current = result.data;
      setDirty(false);
      cache.setQueryData([...libraryKey, block.id], result.data);
      void cache.invalidateQueries({ queryKey: libraryKey });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Tus cambios siguen en el editor.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="block-editor">
      <Link to="/blocks">← Biblioteca de bloques</Link>
      <form
        onInput={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          // Enter can submit while a numeric input still has an uncommitted value.
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
          void save();
        }}
      >
        <header className="editor-header">
          <div>
            <p className="eyebrow">
              Bloque reutilizable · {block.weeks.length} semanas
            </p>
            <label className="field">
              Nombre del bloque
              <input
                required
                maxLength={160}
                pattern=".*\S.*"
                value={block.name}
                disabled={saving}
                onChange={(e) => change({ ...block, name: e.target.value })}
              />
            </label>
          </div>
          <div>
            <label className="field">
              Carpeta
              <select
                disabled={saving || folders.isLoading}
                value={block.folderId ?? ""}
                onChange={(e) =>
                  change({ ...block, folderId: e.target.value || null })
                }
              >
                <option value="">Sin carpeta</option>
                {folders.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving || !dirty || !block.name.trim()}
            >
              {saving ? "Guardando…" : "Guardar bloque"}
            </button>
            <p role="status">
              {saving
                ? "Guardando todos los cambios"
                : dirty
                  ? "Cambios sin guardar"
                  : "Todo guardado"}
            </p>
          </div>
        </header>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {folders.isError && (
          <ErrorState
            message="No se pudieron cargar las carpetas."
            retry={() => void folders.refetch()}
          />
        )}
        <fieldset disabled={saving} className="editor-content">
          <div className="library-toolbar">
            <p className="muted">
              Edita las series directamente. Usa los puntos para arrastrar o las
              flechas para ordenar.
            </p>
            <button
              type="button"
              onClick={() =>
                change({
                  ...block,
                  weeks: [...block.weeks, { id: newId(), days: [] }],
                })
              }
            >
              + Añadir semana
            </button>
          </div>
          <nav className="mobile-week-nav" aria-label="Semana actual">
            <button
              type="button"
              disabled={activeWeek === 0}
              onClick={() => setActiveWeek((n) => n - 1)}
            >
              ←
            </button>
            <span>
              Semana {Math.min(activeWeek, block.weeks.length - 1) + 1} /{" "}
              {block.weeks.length}
            </span>
            <button
              type="button"
              disabled={activeWeek >= block.weeks.length - 1}
              onClick={() => setActiveWeek((n) => n + 1)}
            >
              →
            </button>
          </nav>
          <div className="block-weeks">
            {block.weeks.map((week, wi) => (
              <section
                key={week.id}
                className={`block-week ${wi === Math.min(activeWeek, block.weeks.length - 1) ? "is-current" : ""}`}
              >
                <header className="week-header">
                  <h2>Semana {wi + 1}</h2>
                  <OrderButtons
                    label="semana"
                    index={wi}
                    count={block.weeks.length}
                    onMove={(to) =>
                      change({ ...block, weeks: move(block.weeks, wi, to) })
                    }
                  />
                </header>
                <div className="library-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const weeks = [...block.weeks];
                      weeks.splice(wi + 1, 0, cloneWeek(week));
                      change({ ...block, weeks });
                    }}
                  >
                    Duplicar semana
                  </button>
                  <button
                    type="button"
                    disabled={!week.days.length}
                    onClick={() => {
                      if (confirm("¿Vaciar esta semana y eliminar sus días?"))
                        changeWeek(week.id, { ...week, days: [] });
                    }}
                  >
                    Vaciar
                  </button>
                  <button
                    type="button"
                    disabled={block.weeks.length <= 1}
                    onClick={() => {
                      if (
                        !week.days.length ||
                        confirm("¿Eliminar esta semana y todo su contenido?")
                      )
                        change({
                          ...block,
                          weeks: block.weeks.filter((w) => w.id !== week.id),
                        });
                    }}
                  >
                    Eliminar
                  </button>
                </div>
                {!week.days.length && (
                  <p className="week-empty">
                    Esta semana todavía no tiene entrenamientos.
                  </p>
                )}
                {week.days.map((day, di) => {
                  const changeDay = (next: typeof day) =>
                    changeWeek(week.id, {
                      ...week,
                      days: week.days.map((d) => (d.id === day.id ? next : d)),
                    });
                  return (
                    <article className="planned-day" key={day.id}>
                      <header className="day-header">
                        <label>
                          <span className="sr-only">
                            Nombre del día {di + 1}
                          </span>
                          <input
                            required
                            maxLength={160}
                            pattern=".*\S.*"
                            defaultValue={day.name}
                            onBlur={(e) => {
                              if (e.target.value.trim())
                                changeDay({ ...day, name: e.target.value });
                            }}
                          />
                        </label>
                        <OrderButtons
                          label="día"
                          index={di}
                          count={week.days.length}
                          onMove={(to) =>
                            changeWeek(week.id, {
                              ...week,
                              days: move(week.days, di, to),
                            })
                          }
                        />
                      </header>
                      <div className="library-actions">
                        <button
                          type="button"
                          disabled={week.days.length >= 7}
                          onClick={() => {
                            if (week.days.length >= 7) return;
                            const days = [...week.days];
                            days.splice(di + 1, 0, cloneDay(day));
                            changeWeek(week.id, { ...week, days });
                          }}
                        >
                          Duplicar día
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !day.exercises.length ||
                              confirm("¿Eliminar este día y sus ejercicios?")
                            )
                              changeWeek(week.id, {
                                ...week,
                                days: week.days.filter((d) => d.id !== day.id),
                              });
                          }}
                        >
                          Eliminar día
                        </button>
                      </div>
                      {!day.exercises.length && (
                        <p className="week-empty">Aún no hay ejercicios.</p>
                      )}
                      {day.exercises.map((exercise, ei) => (
                        <ExerciseEditor
                          key={exercise.id}
                          exercise={exercise}
                          index={ei}
                          count={day.exercises.length}
                          onChange={(next) =>
                            changeDay({
                              ...day,
                              exercises: day.exercises.map((e) =>
                                e.id === next.id ? next : e,
                              ),
                            })
                          }
                          onDuplicate={(next) => {
                            const exercises = [...day.exercises];
                            exercises.splice(ei + 1, 0, next);
                            changeDay({ ...day, exercises });
                          }}
                          onDelete={() =>
                            changeDay({
                              ...day,
                              exercises: day.exercises.filter(
                                (e) => e.id !== exercise.id,
                              ),
                            })
                          }
                          onEdit={() =>
                            setPicker({
                              week: week.id,
                              day: day.id,
                              current: exercise,
                            })
                          }
                          onMove={(to) =>
                            changeDay({
                              ...day,
                              exercises: move(day.exercises, ei, to),
                            })
                          }
                          onDrop={(id) =>
                            changeDay({
                              ...day,
                              exercises: move(
                                day.exercises,
                                day.exercises.findIndex((e) => e.id === id),
                                ei,
                              ),
                            })
                          }
                        />
                      ))}
                      <footer>
                        <button
                          type="button"
                          onClick={() =>
                            setPicker({ week: week.id, day: day.id })
                          }
                        >
                          + Añadir ejercicio
                        </button>
                      </footer>
                    </article>
                  );
                })}
                <button
                  type="button"
                  className="add-day"
                  disabled={week.days.length >= 7}
                  onClick={() => changeWeek(week.id, addDay(week))}
                >
                  {week.days.length >= 7 ? "7 / 7 días" : "+ Añadir día"}
                </button>
              </section>
            ))}
          </div>
        </fieldset>
      </form>
      {picker && (
        <ExercisePicker
          current={picker.current}
          onClose={() => setPicker(undefined)}
          onSave={(exercise) => {
            change({
              ...block,
              weeks: block.weeks.map((w) =>
                w.id !== picker.week
                  ? w
                  : {
                      ...w,
                      days: w.days.map((d) =>
                        d.id !== picker.day
                          ? d
                          : {
                              ...d,
                              exercises: picker.current
                                ? d.exercises.map((e) =>
                                    e.id === exercise.id ? exercise : e,
                                  )
                                : [...d.exercises, exercise],
                            },
                      ),
                    },
              ),
            });
            setPicker(undefined);
          }}
        />
      )}
      {blocker.state === "blocked" && (
        <div
          className="leave-block"
          role="alertdialog"
          aria-label="Cambios sin guardar"
        >
          <h2>Hay cambios sin guardar</h2>
          <p>Guarda el bloque antes de salir para conservar tu trabajo.</p>
          <button disabled={saving} onClick={() => blocker.reset()}>
            Seguir editando
          </button>
          <button
            disabled={saving}
            className="button--neutral"
            onClick={() => blocker.proceed()}
          >
            Descartar y salir
          </button>
        </div>
      )}
    </section>
  );
}
