import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  useConfirmExcelImport,
  useRejectExcelImport,
  useUploadExcelImport,
} from '../../api/imports';
import { ApiError } from '../../lib/apiClient';
import { ExcelImportRowsTable } from './ExcelImportRowsTable';

// Restricciones mostradas al coach ANTES de subir (PROMPT 13, punto 2 del
// frontend). Son ayuda de UX únicamente: el backend vuelve a validar todo
// de forma autoritativa (extensión real, magic bytes, tamaño, macros) — ver
// backend/src/common/imports/excel-file-validation.ts. Nunca se confía en
// esta validación del lado del cliente para decidir si algo es seguro.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSION = '.xlsx';

// Pantalla "Importar Excel" del Coach. PROMPT 13 implementó la primera
// mitad (subir, validar, vista previa). PROMPT 14 agrega la segunda mitad
// (RF-19/RF-20): confirmar las filas válidas hacia Program/Block/Week/
// Session/SessionExercise, o rechazar el batch completo — ambos botones ya
// están conectados a los endpoints reales (antes "Confirmar importación"
// era un estado visual deshabilitado, "disponible próximamente").
export function ImportExcelPage() {
  const rejectDialog = useRef<HTMLDialogElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const uploadMutation = useUploadExcelImport();

  const uploadedBatch = uploadMutation.data;
  // Los hooks de mutación siempre se llaman (reglas de hooks) aunque todavía
  // no exista un batch — `mutate()` nunca se invoca antes de que exista uno
  // real, porque los botones que lo disparan solo se renderizan dentro del
  // bloque `{batch && (...)}` de más abajo.
  const confirmMutation = useConfirmExcelImport(uploadedBatch?.id ?? '');
  const rejectMutation = useRejectExcelImport(uploadedBatch?.id ?? '');
  // El batch mostrado es siempre el más reciente: si ya se confirmó o
  // rechazó, `confirmMutation.data`/`rejectMutation.data` reflejan ese
  // resultado (createdPrograms, status CONFIRMED/REJECTED); si no, se
  // muestra la vista previa recién subida.
  const batch = confirmMutation.data ?? rejectMutation.data ?? uploadedBatch;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setClientError(null);
    uploadMutation.reset();
    confirmMutation.reset();
    rejectMutation.reset();

    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validación de UX únicamente (ver comentario de cabecera): un archivo
    // rechazado acá ni siquiera se intenta subir, para no gastar una
    // petición en algo que el backend rechazaría igual, pero el mensaje
    // final de "está bien o no" siempre lo da el backend.
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
    if (!selectedFile) return;
    uploadMutation.mutate(selectedFile);
  }

  const isPendingReview = batch?.status === 'PENDING_REVIEW';
  const isConfirmed = batch?.status === 'CONFIRMED';
  const isRejected = batch?.status === 'REJECTED';

  return (
    <section>
      <dialog
        ref={rejectDialog}
        className="invite-dialog"
        aria-label="Confirmar rechazo"
      >
        <h2>Rechazar importación</h2>
        <p>
          Se rechazará {batch?.originalFilename}. Este lote no podrá confirmarse
          después. No se eliminarán programas existentes; podrás subir el
          archivo nuevamente como otro lote.
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
            Rechazar definitivamente
          </button>
        </div>
      </dialog>
      <div className="page-header">
        <h1>Importar Excel</h1>
      </div>

      <p>
        Sube un archivo <strong>.xlsx</strong> con tu planificación siguiendo la
        plantilla de importación. El sistema valida el archivo y muestra una
        vista previa con los errores encontrados en cada fila antes de confirmar
        nada.
      </p>

      <ul>
        <li>
          Formato admitido: únicamente <code>.xlsx</code> (no se aceptan
          archivos con macros, <code>.xlsm</code>).
        </li>
        <li>Tamaño máximo: 5 MB.</li>
        <li>
          Cada fila representa la prescripción de un ejercicio dentro de una
          sesión.
        </li>
        <li>Los ejercicios referenciados deben existir ya en tu catálogo.</li>
      </ul>

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
          {uploadMutation.isPending ? 'Procesando…' : 'Subir archivo'}
        </button>
      </form>

      {clientError && (
        <p role="alert" className="field-error">
          {clientError}
        </p>
      )}

      {uploadMutation.isPending && (
        <p>Procesando el archivo, por favor espera…</p>
      )}

      {uploadMutation.isError && (
        <p role="alert" className="field-error">
          {uploadMutation.error instanceof ApiError
            ? uploadMutation.error.message
            : 'No se pudo procesar el archivo.'}
        </p>
      )}

      {batch && (
        <div className="import-preview">
          <h2>Vista previa de la importación</h2>
          <p>
            Archivo: <strong>{batch.originalFilename}</strong> — Estado:{' '}
            <strong>{batch.status}</strong>
          </p>
          <p>
            Total de filas: {batch.counts.totalRows} — Válidas:{' '}
            {batch.counts.validRows} — Inválidas: {batch.counts.invalidRows}
          </p>

          <ExcelImportRowsTable rows={batch.rows} />

          {isPendingReview && (
            <div className="import-preview__confirmation">
              <p>
                Las filas inválidas <strong>no se importarán</strong>:
                corrígelas en tu archivo y vuelve a subirlo si quieres que
                también queden programadas. Una vez confirmada, la importación
                pasa a formar parte de tu programación de inmediato y{' '}
                <strong>la operación no debe repetirse</strong>.
              </p>

              <div className="import-preview__actions">
                <button
                  type="button"
                  className="button--primary"
                  onClick={() => confirmMutation.mutate()}
                  disabled={
                    batch.counts.validRows === 0 ||
                    confirmMutation.isPending ||
                    rejectMutation.isPending
                  }
                >
                  {confirmMutation.isPending
                    ? 'Confirmando…'
                    : 'Confirmar importación'}
                </button>
                <button
                  type="button"
                  className="button--danger"
                  onClick={() => rejectDialog.current?.showModal()}
                  disabled={
                    confirmMutation.isPending || rejectMutation.isPending
                  }
                >
                  {rejectMutation.isPending
                    ? 'Rechazando…'
                    : 'Rechazar importación'}
                </button>
              </div>

              {batch.counts.validRows === 0 && (
                <p role="alert" className="field-error">
                  El archivo no tiene ninguna fila válida: no hay nada que
                  confirmar. Corrige los errores y vuelve a subirlo.
                </p>
              )}
            </div>
          )}

          {confirmMutation.isError && (
            <p role="alert" className="field-error">
              {confirmMutation.error instanceof ApiError
                ? confirmMutation.error.message
                : 'No se pudo confirmar la importación.'}
            </p>
          )}

          {rejectMutation.isError && (
            <p role="alert" className="field-error">
              {rejectMutation.error instanceof ApiError
                ? rejectMutation.error.message
                : 'No se pudo rechazar la importación.'}
            </p>
          )}

          {isConfirmed && (
            <div className="import-preview__result" role="status">
              <h3>Importación confirmada</h3>
              <p>
                Esta importación ya está confirmada y forma parte de tu
                programación. No es necesario (ni posible) repetir la
                confirmación.
              </p>
              {batch.createdPrograms.length > 0 && (
                <>
                  <p>Programas creados a partir de este archivo:</p>
                  <ul>
                    {batch.createdPrograms.map((program) => (
                      <li key={program.id}>{program.name}</li>
                    ))}
                  </ul>
                </>
              )}
              <Link to="/programs">Ir a Mis programas</Link>
            </div>
          )}

          {isRejected && (
            <div className="import-preview__result" role="status">
              <h3>Importación rechazada</h3>
              <p>
                Este batch fue rechazado: no se creó ninguna programación a
                partir de él.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
