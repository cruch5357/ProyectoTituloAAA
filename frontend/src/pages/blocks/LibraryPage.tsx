import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryKey, useFolders, useLibrary } from "../../api/blockLibrary";
import { apiClient } from "../../lib/apiClient";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "../../components/ui/Primitives";
import type { LibraryBlock } from "./library-model";
import { savePayload } from "./library-model";
import "./library.css";

export function LibraryPage() {
  const query = useLibrary();
  const folders = useFolders();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(6);
  const [folder, setFolder] = useState("");
  const [folderName, setFolderName] = useState("");
  const [filter, setFilter] = useState("all");
  const busy = useRef(false);
  const action = useMutation({
    mutationFn: async (job: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await job();
      } finally {
        busy.current = false;
      }
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: libraryKey }),
  });
  const createFolder = useMutation({
    mutationFn: () =>
      apiClient.post("/block-library/folders", { name: folderName.trim() }),
    onSuccess: () => {
      setFolderName("");
      void cache.invalidateQueries({ queryKey: ["block-folders"] });
    },
  });
  function editMetadata(
    id: string,
    values: Partial<Pick<LibraryBlock, "name" | "folderId">>,
  ) {
    action.mutate(async () => {
      const current = (
        await apiClient.get<LibraryBlock>(`/block-library/${id}`)
      ).data;
      await apiClient.patch(
        `/block-library/${id}`,
        savePayload({ ...current, ...values }),
      );
    });
  }
  return (
    <section className="block-library">
      <PageHeader
        title="Bloques"
        description="Tu biblioteca reutilizable de semanas, sesiones y ejercicios."
        actions={
          <button
            onClick={() => {
              action.reset();
              setName("");
              setWeeks(6);
              setFolder("");
              dialog.current?.showModal();
            }}
          >
            Crear bloque
          </button>
        }
      />
      <div className="library-toolbar">
        <label>
          Carpeta{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos los bloques</option>
            <option value="">Sin carpeta</option>
            {folders.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!createFolder.isPending) createFolder.mutate();
          }}
        >
          <input
            aria-label="Nombre de carpeta"
            maxLength={160}
            placeholder="Nueva carpeta"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
          <button disabled={!folderName.trim() || createFolder.isPending}>
            Crear carpeta
          </button>
        </form>
      </div>
      {(action.error || createFolder.error) && (
        <p role="alert">{(action.error || createFolder.error)?.message}</p>
      )}
      {query.isLoading && <Skeleton label="Cargando bloques…" />}
      {(query.isError || folders.isError) && (
        <ErrorState
          retry={() => {
            void query.refetch();
            void folders.refetch();
          }}
        />
      )}
      {query.isSuccess && !query.data.length && (
        <EmptyState
          title="Todavía no tienes bloques"
          description="Crea tu primer bloque de entrenamiento."
        />
      )}
      <div className="library-grid">
        {query.data
          ?.filter((b) => filter === "all" || (b.folderId ?? "") === filter)
          .map((b) => (
            <article className="card" key={b.id}>
              <p className="eyebrow">
                {b.weekCount} semanas ·{" "}
                {folders.data?.find((f) => f.id === b.folderId)?.name ??
                  "Sin carpeta"}
              </p>
              <h2>
                <Link to={`/block-library/${b.id}`}>{b.name}</Link>
              </h2>
              <div className="library-actions">
                <Link className="button" to={`/block-library/${b.id}`}>
                  Abrir / editar
                </Link>
                <button
                  className="button--neutral"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(async () => {
                      await apiClient.post(`/block-library/${b.id}/duplicate`);
                    })
                  }
                >
                  Duplicar
                </button>
                <button
                  className="button--neutral"
                  disabled={action.isPending}
                  onClick={() => {
                    if (confirm(`¿Eliminar «${b.name}» y todo su contenido?`))
                      action.mutate(async () => {
                        await apiClient.delete(`/block-library/${b.id}`);
                      });
                  }}
                >
                  Eliminar
                </button>
                <button
                  className="button--neutral"
                  disabled={action.isPending}
                  onClick={() => {
                    const next = prompt("Nombre del bloque", b.name);
                    if (next?.trim()) editMetadata(b.id, { name: next.trim() });
                  }}
                >
                  Renombrar
                </button>
              </div>
              <label className="field">
                Mover a carpeta
                <select
                  aria-label={`Carpeta de ${b.name}`}
                  disabled={action.isPending || folders.isError}
                  value={b.folderId ?? ""}
                  onChange={(e) =>
                    editMetadata(b.id, { folderId: e.target.value || null })
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
            </article>
          ))}
      </div>
      <dialog ref={dialog} className="invite-dialog" aria-label="Crear bloque">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(async () => {
              const result = await apiClient.post<LibraryBlock>(
                "/block-library",
                {
                  name: name.trim(),
                  weekCount: weeks,
                  folderId: folder || null,
                },
              );
              dialog.current?.close();
              navigate(`/block-library/${result.data.id}`);
            });
          }}
        >
          <h2>Crear bloque</h2>
          <label className="field">
            Nombre
            <input
              autoFocus
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">Cantidad de semanas</label>
          <div className="week-stepper">
            <button
              type="button"
              aria-label="Menos semanas"
              disabled={weeks <= 1}
              onClick={() => setWeeks((n) => n - 1)}
            >
              −
            </button>
            <output aria-live="polite">{weeks}</output>
            <button
              type="button"
              aria-label="Más semanas"
              onClick={() => setWeeks((n) => n + 1)}
            >
              +
            </button>
          </div>
          <label className="field">
            Carpeta
            <select aria-label="Carpeta" value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">Sin carpeta</option>
              {folders.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {action.error && <p role="alert">{action.error.message}</p>}
          <div className="dialog-actions">
            <button disabled={!name.trim() || action.isPending}>
              {action.isPending ? "Creando…" : "Crear bloque"}
            </button>
            <button
              type="button"
              className="button--neutral"
              disabled={action.isPending}
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
