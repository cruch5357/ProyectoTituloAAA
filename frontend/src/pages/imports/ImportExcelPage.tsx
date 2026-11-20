import { useRef, useState } from 'react';
import { useBackdropClose } from '../../lib/useBackdropClose';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  useConfirmExcelImport,
  useDownloadExcelTemplate,
  useRejectExcelImport,
  useUploadExcelImport,
} from '../../api/imports';
import { apiClient, ApiError } from '../../lib/apiClient';
import type { ExcelImportBatch } from '../../types/excelImport';
import { ExcelImportRowsTable } from './ExcelImportRowsTable';
import { FIELD_LABELS } from './excelImportLabels';
import { NoExercisesDialog } from './NoExercisesDialog';

// Ayuda de UX únicamente: el backend vuelve a validar todo (extensión real,
// contenido, tamaño y macros).
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSION = '.xlsx';
const MAX_LISTED_ERRORS = 100;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// "Importar Excel" del coach: descarga la plantilla, sube el archivo, revisa
// los errores (con su fila y celda) y, si no hay ninguno, confirma para crear
// los bloques en la biblioteca de Bloques.
export function ImportExcelPage() {
  const rejectDialog = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(rejectDialog);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  // Vista previa recargada cuando la confirmación encuentra errores nuevos
  // (por ejemplo, un ejercicio desactivado después de subir el archivo).
  const [refreshed, setRefreshed] = useState<ExcelImportBatch | null>(null);
  const uploadMutation = useUploadExcelImport();
  const templateMutation = useDownloadExcelTemplate();

  const uploadedBatch = uploadMutation.data;
  const confirmMutation = useConfirmExcelImport(uploadedBatch?.id ?? '');
  const rejectMutation = useRejectExcelImport(uploadedBatch?.id ?? '');
  const batch =
    confirmMutation.data ?? rejectMutation.data ?? refreshed ?? uploadedBatch;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setClientError(null);
    setRefreshed(null);
    uploadMutation.reset();
    confirmMutation.reset();
    rejectMutation.reset();
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(ALLOWED_EXTENSION)) {
      setClientError(
        'Solo se aceptan archivos .xlsx (no se admiten .xlsm ni otros formatos).',
      );
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setClientError('El archivo supera el tamaño máximo permitido (5 MB).');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFile) uploadMutation.mutate(selectedFile);
  }

  function confirm() {
    if (!batch) return;
    confirmMutation.mutate(undefined, {
      onError: () => {
        apiClient
          .get<ExcelImportBatch>(`/imports/excel/${batch.id}`)
          .then((response) => setRefreshed(response.data))
          .catch(() => undefined);
      },
    });
  }

  const isPendingReview = batch?.status === 'PENDING_REVIEW';
  const errors =
    batch?.rows.flatMap((row) =>
      (row.errors ?? []).map((error) => ({
        ...error,
        rowNumber: row.rowNumber,
      })),
    ) ?? [];
  const rowsWithErrors = batch?.counts.invalidRows ?? 0;
  const canConfirm =
    isPendingReview &&
    !batch.legacyTemplate &&
    rowsWithErrors === 0 &&
    batch.plan.length > 0;

  return (
    <section className="excel-import">
      <NoExercisesDialog />
      <dialog
        ref={rejectDialog}
        {...backdropClose}
        className="invite-dialog"
        aria-label="Confirmar rechazo"
      >
        <h2>Descartar importación</h2>
        <p>
          Se descartará {batch?.originalFilename} sin crear ningún bloque.
          Podrás subir el archivo de nuevo cuando quieras.
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button--neutral"
            onClick={() => rejectDialog.current?.close()}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button--danger"
            onClick={() => {
              rejectDialog.current?.close();
              rejectMutation.mutate();
            }}
          >
            Descartar
          </button>
        </div>
      </dialog>

      <div className="page-header">
        <h1>Importar Excel</h1>
        <button
          type="button"
          onClick={() => templateMutation.mutate()}
          disabled={templateMutation.isPending}
        >
          {templateMutation.isPending ? 'Descargando…' : 'Descargar plantilla'}
        </button>
      </div>
      {templateMutation.isError && (
        <p role="alert" className="field-error">
          No se pudo descargar la plantilla. Intenta nuevamente.
        </p>
      )}

      <p className="excel-import__intro">
        Arma tus bloques en Excel y súbelos: quedarán en{' '}
        <strong>Bloques</strong>, listos para revisarlos y asignarlos con
        &quot;Asignar ciclo&quot;.
      </p>

      <ol className="excel-import__steps">
        <li>
          <strong>Descarga la plantilla.</strong> Trae tus ejercicios en una
          lista desplegable y filas de ejemplo que puedes reemplazar.
        </li>
        <li>
          <strong>Escribe una fila por ejercicio.</strong> Obligatorio: Bloque,
          Semana, Día y Ejercicio. Opcional: Series, Reps, Carga (kg), RPE y
          Notas.
        </li>
        <li>
          <strong>Sube el archivo.</strong> Si algo está mal, te indicamos la
          fila y la celda exacta (por ejemplo D5) para que la corrijas.
        </li>
        <li>
          <strong>Confirma.</strong> Se crean los bloques y puedes editarlos
          antes de asignarlos.
        </li>
      </ol>

      <div className="excel-import__rule" role="note">
        <p>
          <strong>Importante:</strong> escribe el nombre de cada bloque y de
          cada día <strong>exactamente igual</strong> en todas sus filas (mismas
          tildes, mayúsculas y espacios). Si &quot;Fuerza base&quot; aparece
          también como &quot;fuerza base&quot;, el Excel no se puede importar.
        </p>
        <p className="muted">
          Atajo: deja Bloque, Semana y Día vacíos para repetir los de la fila de
          arriba. Para series distintas (pirámides), escribe el mismo ejercicio
          en filas seguidas.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="search-form">
        <label className="field">
          <span>Archivo Excel (.xlsx)</span>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            disabled={uploadMutation.isPending}
          />
        </label>
        <button
          type="submit"
          disabled={!selectedFile || uploadMutation.isPending}
        >
          {uploadMutation.isPending ? 'Revisando…' : 'Subir archivo'}
        </button>
      </form>

      {clientError && (
        <p role="alert" className="field-error">
          {clientError}
        </p>
      )}
      {uploadMutation.isError && (
        <p role="alert" className="excel-import__problem">
          {uploadMutation.error instanceof ApiError
            ? uploadMutation.error.message
            : 'No se pudo procesar el archivo.'}
        </p>
      )}

      {batch && (
        <div className="import-preview">
          <h2>Revisión de {batch.originalFilename}</h2>
          <p className="muted">
            {plural(batch.counts.totalRows, 'fila leída', 'filas leídas')} ·{' '}
            {plural(batch.counts.validRows, 'correcta', 'correctas')} ·{' '}
            {plural(rowsWithErrors, 'con errores', 'con errores')}
          </p>

          {isPendingReview && batch.legacyTemplate && (
            <p role="alert" className="excel-import__problem">
              Esta importación se subió con la plantilla anterior y ya no se
              puede confirmar. Descarga la plantilla nueva, copia tu
              planificación y súbela otra vez.
            </p>
          )}

          {isPendingReview && !batch.legacyTemplate && rowsWithErrors > 0 && (
            <div className="excel-import__errors" role="alert">
              <h3>
                Corrige {plural(rowsWithErrors, 'fila', 'filas')} en tu Excel
                antes de importar
              </h3>
              <p>
                El archivo solo se importa si todas sus filas están correctas.
                Corrige estas celdas y vuelve a subirlo:
              </p>
              <ul>
                {errors.slice(0, MAX_LISTED_ERRORS).map((error, index) => (
                  <li key={`${error.rowNumber}-${error.field}-${index}`}>
                    <strong>
                      Fila {error.rowNumber}
                      {error.cell ? ` · celda ${error.cell}` : ''} (
                      {FIELD_LABELS[error.field] ?? error.field}):
                    </strong>{' '}
                    {error.message}
                  </li>
                ))}
              </ul>
              {errors.length > MAX_LISTED_ERRORS && (
                <p className="muted">
                  Y {errors.length - MAX_LISTED_ERRORS} errores más: corrige
                  estos primero y vuelve a subirlo.
                </p>
              )}
            </div>
          )}

          {canConfirm && (
            <div className="excel-import__ready">
              <h3>Todo correcto. Se crearán estos bloques:</h3>
              <ul>
                {batch.plan.map((block) => (
                  <li key={block.name}>
                    <strong>{block.name}</strong>:{' '}
                    {plural(block.weeks, 'semana', 'semanas')} ·{' '}
                    {plural(block.days, 'día', 'días')} ·{' '}
                    {plural(block.exercises, 'ejercicio', 'ejercicios')} ·{' '}
                    {plural(block.sets, 'serie', 'series')}
                    {block.alreadyExists && (
                      <span className="excel-import__warning">
                        {' '}
                        Ya tienes un bloque con este nombre: se creará otro.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isPendingReview && (
            <div className="import-preview__actions">
              <button
                type="button"
                className="button--primary"
                onClick={confirm}
                disabled={
                  !canConfirm ||
                  confirmMutation.isPending ||
                  rejectMutation.isPending
                }
              >
                {confirmMutation.isPending
                  ? 'Creando bloques…'
                  : 'Confirmar importación'}
              </button>
              <button
                type="button"
                className="button--neutral"
                onClick={() => rejectDialog.current?.showModal()}
                disabled={confirmMutation.isPending || rejectMutation.isPending}
              >
                Descartar
              </button>
            </div>
          )}

          {confirmMutation.isError && (
            <p role="alert" className="excel-import__problem">
              {confirmMutation.error instanceof ApiError
                ? confirmMutation.error.message
                : 'No se pudo confirmar la importación.'}
            </p>
          )}
          {rejectMutation.isError && (
            <p role="alert" className="field-error">
              {rejectMutation.error instanceof ApiError
                ? rejectMutation.error.message
                : 'No se pudo descartar la importación.'}
            </p>
          )}

          {batch.status === 'CONFIRMED' && (
            <div className="excel-import__ready" role="status">
              <h3>Importación confirmada</h3>
              {batch.createdBlocks.length > 0 && (
                <ul>
                  {batch.createdBlocks.map((block) => (
                    <li key={block.id}>
                      <strong>{block.name}</strong>{' '}
                      {block.programId ? (
                        <Link to={`/programs/${block.programId}`}>
                          Ver programa
                        </Link>
                      ) : (
                        <Link to={`/block-library/${block.id}`}>
                          Abrir y editar
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/blocks">Ir a Bloques</Link>
            </div>
          )}

          {batch.status === 'REJECTED' && (
            <div className="import-preview__result" role="status">
              <h3>Importación descartada</h3>
              <p>No se creó ningún bloque a partir de este archivo.</p>
            </div>
          )}

          <details
            className="excel-import__rows"
            open={batch.rows.length <= 30}
          >
            <summary>Ver lo que se leyó de cada fila</summary>
            <ExcelImportRowsTable rows={batch.rows} />
          </details>
        </div>
      )}
    </section>
  );
}
