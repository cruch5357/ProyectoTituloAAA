import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLibrary, useLibraryBlock } from "../../api/blockLibrary";
import { trainingLabels, useTraining } from "../../api/training";
import { apiClient } from "../../lib/apiClient";
import { todayDate } from "../../lib/calendarDate";
import { readableDate } from "../../lib/readableDate";
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from "../../components/ui/Primitives";
import "../student-training/training.css";

export function BlockAssignmentPanel({ studentId }: { studentId: string }) {
  const query = useTraining(studentId);
  const blocks = useLibrary();
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState(todayDate());
  const [replace, setReplace] = useState(false);
  const [offsets, setOffsets] = useState([1, 2, 3, 4, 5, 6, 7]);
  const detail = useLibraryBlock(selected);
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const cache = useQueryClient();
  const maxDays = Math.max(
    0,
    ...(detail.data?.weeks.map((w) => w.days.length) ?? []),
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        await apiClient.post(`/students/${studentId}/block-assignments`, {
          blockId: selected,
          startDate: date,
          replaceActive: replace,
          dayOffsets: offsets.slice(0, maxDays),
        });
      } finally {
        busy.current = false;
      }
    },
    onSuccess: () => {
      dialog.current?.close();
      void cache.invalidateQueries({ queryKey: ["training"] });
      void cache.invalidateQueries({ queryKey: ["coaching"] });
    },
  });
  const validOffsets = offsets
    .slice(0, maxDays)
    .every((n, i, a) => i === 0 || n > a[i - 1]);
  return (
    <section className="training-panel">
      <header className="page-header">
        <div>
          <p className="eyebrow">Planificación del alumno</p>
          <h2>Ciclo de entrenamiento</h2>
        </div>
        <button
          onClick={() => {
            mutation.reset();
            setReplace(false);
            dialog.current?.showModal();
          }}
        >
          Asignar bloque
        </button>
      </header>
      {query.isLoading && <Skeleton />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.data?.assignments.length === 0 && (
        <EmptyState
          title="Sin bloque asignado"
          description="Selecciona un bloque de tu biblioteca para iniciar el ciclo."
        />
      )}
      {query.data?.assignments.map((a) => (
        <article className="training-cycle" key={a.id}>
          <p className="eyebrow">
            {a.legacy ? "Plan anterior conservado" : "Ciclo activo"}
          </p>
          <h3>{a.name}</h3>
          <p>
            Inicio:{" "}
            {a.startDate
              ? readableDate(a.startDate, false)
              : "Sin fecha configurada"}{" "}
            ·{" "}
            {a.currentWeek
              ? `Semana ${a.currentWeek.weekNumber} de ${a.weekCount}`
              : "Fuera del período del ciclo"}
          </p>
          <progress max={a.totalSessions || 1} value={a.finishedSessions} />
          <p>
            {a.finishedSessions} / {a.totalSessions} sesiones finalizadas ·{" "}
            {a.adherence.completedSessions} completadas de{" "}
            {a.adherence.scheduledSessions} programadas hasta hoy
          </p>
          <div className="training-session-list">
            {query.data?.sessions
              .filter((s) => s.assignmentId === a.id)
              .map((s) => (
                <Link key={s.id} to={`/training/sessions/${s.sessionId}?assignmentId=${s.assignmentId}`}>
                  <span>
                    Semana {s.weekNumber} · {s.name}
                  </span>
                  <small>
                    {s.date ? readableDate(s.date, false) : "Sin fecha"} ·{" "}
                    {trainingLabels[s.status]}
                  </small>
                </Link>
              ))}
          </div>
        </article>
      ))}
      <dialog
        ref={dialog}
        className="assign-block-dialog"
        aria-label="Asignar bloque"
        onCancel={(e) => {
          if (mutation.isPending) e.preventDefault();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <h2>Asignar bloque</h2>
          <p>
            Se guardará una copia privada. Las futuras ediciones de tu
            biblioteca no cambiarán este ciclo.
          </p>
          {blocks.isLoading && <Skeleton />}
          {blocks.isError && <ErrorState retry={() => void blocks.refetch()} />}
          <label className="field">
            Bloque reusable
            <select
              aria-label="Bloque reusable"
              required
              value={selected}
              disabled={mutation.isPending}
              onChange={(e) => {
                setSelected(e.target.value);
                setOffsets([1, 2, 3, 4, 5, 6, 7]);
              }}
            >
              <option value="">Selecciona un bloque</option>
              {blocks.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.weekCount} semanas
                </option>
              ))}
            </select>
          </label>
          {!blocks.data?.length && blocks.isSuccess && (
            <Link to="/blocks">Crear un bloque en la biblioteca</Link>
          )}
          <label className="field">
            Fecha de inicio
            <input
              type="date"
              required
              value={date}
              disabled={mutation.isPending}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {selected && detail.isLoading && <Skeleton />}
          {selected && detail.isError && (
            <ErrorState retry={() => void detail.refetch()} />
          )}
          {detail.data && (
            <>
              <h3>Distribución semanal</h3>
              <p className="muted">
                La posición 1 es la fecha de inicio; la 3 es dos días después.
                El patrón se repite cada siete días. Las semanas vacías quedan
                libres.
              </p>
              {Array.from({ length: maxDays }, (_, i) => (
                <label key={i} className="field">
                  Día {i + 1} del bloque → posición
                  <select
                    aria-label={`Posición del día ${i + 1}`}
                    value={offsets[i]}
                    disabled={mutation.isPending}
                    onChange={(e) =>
                      setOffsets((v) =>
                        v.map((n, j) => (j === i ? Number(e.target.value) : n)),
                      )
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {!maxDays && (
                <p role="alert">
                  Este bloque no tiene días. Añádelos en la biblioteca antes de
                  asignarlo.
                </p>
              )}
              {!validOffsets && (
                <p role="alert">
                  Elige posiciones distintas y en orden creciente.
                </p>
              )}
              {date && validOffsets && (
                <div className="assignment-preview">
                  <strong>Primera semana</strong>
                  {detail.data.weeks[0]?.days.map((d, i) => {
                    const value = new Date(`${date}T12:00:00Z`);
                    value.setUTCDate(value.getUTCDate() + offsets[i] - 1);
                    return (
                      <p key={d.id}>
                        {d.name} ·{" "}
                        {Number.isFinite(value.getTime())
                          ? readableDate(
                              value.toISOString().slice(0, 10),
                              false,
                            )
                          : "Fecha inválida"}
                      </p>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {!!query.data?.assignments.length && (
            <label className="replace-cycle">
              <input
                type="checkbox"
                checked={replace}
                disabled={mutation.isPending}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Cerrar el ciclo activo y reemplazarlo. Su historial se conserva.
            </label>
          )}
          {mutation.error && (
            <p role="alert" className="field-error">
              {mutation.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              disabled={
                mutation.isPending ||
                !selected ||
                !date ||
                !maxDays ||
                !validOffsets ||
                !query.isSuccess ||
                (!!query.data?.assignments.length && !replace)
              }
            >
              {mutation.isPending ? "Asignando…" : "Confirmar asignación"}
            </button>
            <button
              type="button"
              className="button--neutral"
              disabled={mutation.isPending}
              onClick={() => dialog.current?.close()}
            >
              Cancelar
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
