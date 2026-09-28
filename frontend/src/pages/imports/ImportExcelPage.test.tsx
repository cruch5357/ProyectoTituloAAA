import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ImportExcelPage } from './ImportExcelPage';
import type { ExcelImportBatch } from '../../types/excelImport';

function buildBatch(overrides: Partial<ExcelImportBatch> = {}): ExcelImportBatch {
  return {
    id: 'batch-1',
    originalFilename: 'plan.xlsx',
    status: 'PENDING_REVIEW',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    confirmedAt: null,
    counts: { totalRows: 0, validRows: 0, invalidRows: 0 },
    rows: [],
    createdPrograms: [],
    ...overrides,
  };
}

function buildRows() {
  return [
    {
      id: 'row-1',
      rowNumber: 2,
      status: 'VALID' as const,
      errors: null,
      data: { programName: 'Hipertrofia', exerciseName: 'Sentadilla' },
      resultSessionExerciseId: null,
    },
    {
      id: 'row-2',
      rowNumber: 3,
      status: 'INVALID' as const,
      errors: [{ field: 'target_rpe', message: 'debe estar entre 0 y 10' }],
      data: { programName: 'Hipertrofia', exerciseName: 'Press banca' },
      resultSessionExerciseId: null,
    },
  ];
}

function buildXlsxFile(name = 'plan.xlsx', sizeBytes = 1024): File {
  const file = new File([new Uint8Array(sizeBytes)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return file;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 13 — "selección de archivo".
describe('ImportExcelPage - selección de archivo', () => {
  it('habilita el botón de subir solo cuando se selecciona un archivo válido', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportExcelPage />);

    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeDisabled();

    const input = screen.getByLabelText('Archivo Excel (.xlsx)');
    await user.upload(input, buildXlsxFile());

    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeEnabled();
  });
});

// PROMPT 13 — "validación básica" (ayuda de UX, nunca autoritativa).
describe('ImportExcelPage - validación básica del lado del cliente', () => {
  it('rechaza una extensión distinta de .xlsx antes de subir', () => {
    // Se usa fireEvent (no userEvent.upload) a propósito: `userEvent.upload`
    // respeta el atributo `accept` del input y ni siquiera dispara el
    // evento para un archivo que el picker del sistema operativo ya habría
    // filtrado. Un usuario real puede igual llegar a este estado (eligiendo
    // "todos los archivos" o arrastrando el archivo), así que la validación
    // propia del componente debe probarse sin depender de ese filtro del
    // navegador — el backend, de todas formas, es quien valida de verdad.
    const postFileSpy = vi.spyOn(apiClient, 'postFile');
    renderWithProviders(<ImportExcelPage />);

    const input = screen.getByLabelText('Archivo Excel (.xlsx)');
    fireEvent.change(input, { target: { files: [buildXlsxFile('plan.xlsm')] } });

    expect(
      screen.getByText(/Solo se aceptan archivos \.xlsx/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeDisabled();
    expect(postFileSpy).not.toHaveBeenCalled();
  });

  it('rechaza un archivo que excede el tamaño máximo', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportExcelPage />);

    const input = screen.getByLabelText('Archivo Excel (.xlsx)');
    await user.upload(input, buildXlsxFile('plan.xlsx', 6 * 1024 * 1024));

    expect(
      screen.getByText(/supera el tamaño máximo permitido/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeDisabled();
  });
});

// PROMPT 13 — "upload" + "vista previa".
describe('ImportExcelPage - subida y vista previa', () => {
  it('sube el archivo seleccionado y muestra la vista previa', async () => {
    const user = userEvent.setup();
    const batch = buildBatch({
      counts: { totalRows: 2, validRows: 1, invalidRows: 1 },
      rows: buildRows(),
    });
    vi.spyOn(apiClient, 'postFile').mockResolvedValue({
      data: batch,
      error: null,
      meta: {},
    });

    renderWithProviders(<ImportExcelPage />);
    const input = screen.getByLabelText('Archivo Excel (.xlsx)');
    await user.upload(input, buildXlsxFile());
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }));

    expect(apiClient.postFile).toHaveBeenCalledWith(
      '/imports/excel',
      expect.any(FormData),
    );

    expect(await screen.findByText('Vista previa de la importación')).toBeInTheDocument();
    expect(screen.getByText(/Total de filas: 2/)).toBeInTheDocument();
  });

  // PROMPT 13 — "filas válidas"/"filas inválidas"/"errores por fila".
  it('muestra las filas válidas e inválidas con sus errores', async () => {
    const user = userEvent.setup();
    const batch = buildBatch({
      counts: { totalRows: 2, validRows: 1, invalidRows: 1 },
      rows: buildRows(),
    });
    vi.spyOn(apiClient, 'postFile').mockResolvedValue({
      data: batch,
      error: null,
      meta: {},
    });

    renderWithProviders(<ImportExcelPage />);
    await user.upload(screen.getByLabelText('Archivo Excel (.xlsx)'), buildXlsxFile());
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }));

    expect(await screen.findByText('Válida')).toBeInTheDocument();
    expect(screen.getByText('Inválida')).toBeInTheDocument();
    expect(screen.getByText(/debe estar entre 0 y 10/)).toBeInTheDocument();
  });

  // PROMPT 13 — "estado vacío".
  it('muestra un estado vacío cuando el archivo no tiene filas de datos', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'postFile').mockResolvedValue({
      data: buildBatch(),
      error: null,
      meta: {},
    });

    renderWithProviders(<ImportExcelPage />);
    await user.upload(screen.getByLabelText('Archivo Excel (.xlsx)'), buildXlsxFile());
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }));

    expect(
      await screen.findByText('El archivo no tiene filas de datos.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Total de filas: 0/)).toBeInTheDocument();
  });

  // PROMPT 13 — "errores" (respuesta del backend).
  it('muestra el mensaje de error del backend cuando la subida falla', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'postFile').mockRejectedValue(
      new ApiError(400, 'El archivo no es un Excel (.xlsx) válido.'),
    );

    renderWithProviders(<ImportExcelPage />);
    await user.upload(screen.getByLabelText('Archivo Excel (.xlsx)'), buildXlsxFile());
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }));

    await waitFor(() => {
      expect(
        screen.getByText('El archivo no es un Excel (.xlsx) válido.'),
      ).toBeInTheDocument();
    });
  });

  it('deshabilita "Confirmar importación" cuando no hay ninguna fila válida', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'postFile').mockResolvedValue({
      data: buildBatch(),
      error: null,
      meta: {},
    });

    renderWithProviders(<ImportExcelPage />);
    await user.upload(screen.getByLabelText('Archivo Excel (.xlsx)'), buildXlsxFile());
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }));

    const confirmButton = await screen.findByRole('button', {
      name: 'Confirmar importación',
    });
    expect(confirmButton).toBeDisabled();
  });
});

// PROMPT 14 — "confirmación", "rechazo" y "resultado" de una importación.
describe('ImportExcelPage - confirmación y rechazo (PROMPT 14)', () => {
  async function uploadPreview(batch: ExcelImportBatch = buildBatch({
    counts: { totalRows: 2, validRows: 1, invalidRows: 1 },
    rows: buildRows(),
  })) {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'postFile').mockResolvedValue({
      data: batch,
      error: null,
      meta: {},
    });
    renderWithProviders(<ImportExcelPage />);
    await user.upload(screen.getByLabelText('Archivo Excel (.xlsx)'), buildXlsxFile());
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }));
    await screen.findByText('Vista previa de la importación');
    return user;
  }

  it('muestra el botón "Confirmar importación" habilitado cuando hay al menos una fila válida', async () => {
    await uploadPreview();

    expect(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Rechazar importación' }),
    ).toBeEnabled();
  });

  it('confirma la importación y muestra el resultado (programas creados) al hacer clic', async () => {
    const user = await uploadPreview();
    const confirmedBatch = buildBatch({
      status: 'CONFIRMED',
      confirmedAt: '2026-01-01T00:05:00.000Z',
      counts: { totalRows: 2, validRows: 1, invalidRows: 1 },
      rows: buildRows(),
      createdPrograms: [{ id: 'program-1', name: 'Hipertrofia' }],
    });
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: confirmedBatch, error: null, meta: {} });

    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(postSpy).toHaveBeenCalledWith('/imports/excel/batch-1/confirm');
    expect(await screen.findByText('Importación confirmada')).toBeInTheDocument();
    expect(screen.getByText('Hipertrofia')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ir a Mis programas' }),
    ).toHaveAttribute('href', '/programs');
    // El panel de confirmar/rechazar desaparece una vez decidido.
    expect(
      screen.queryByRole('button', { name: 'Confirmar importación' }),
    ).not.toBeInTheDocument();
  });

  it('muestra un estado de carga mientras se confirma', async () => {
    const user = await uploadPreview();
    let resolveConfirm!: (value: { data: ExcelImportBatch; error: null; meta: object }) => void;
    vi.spyOn(apiClient, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByText('Confirmando…')).toBeInTheDocument();

    resolveConfirm({
      data: buildBatch({ status: 'CONFIRMED', createdPrograms: [] }),
      error: null,
      meta: {},
    });
  });

  it('muestra el mensaje de error del backend cuando la confirmación falla', async () => {
    const user = await uploadPreview();
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError(409, 'La importación ya fue confirmada o rechazada anteriormente.'),
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(
      await screen.findByText(
        'La importación ya fue confirmada o rechazada anteriormente.',
      ),
    ).toBeInTheDocument();
  });

  it('rechaza la importación al hacer clic en "Rechazar importación"', async () => {
    const user = await uploadPreview();
    const rejectedBatch = buildBatch({ status: 'REJECTED' });
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: rejectedBatch, error: null, meta: {} });

    await user.click(screen.getByRole('button', { name: 'Rechazar importación' }));

    expect(postSpy).toHaveBeenCalledWith('/imports/excel/batch-1/reject');
    expect(await screen.findByText('Importación rechazada')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rechazar importación' }),
    ).not.toBeInTheDocument();
  });

  it('permite navegar a "Mis programas" después de confirmar', async () => {
    const user = await uploadPreview();
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: buildBatch({
        status: 'CONFIRMED',
        createdPrograms: [{ id: 'program-1', name: 'Hipertrofia' }],
      }),
      error: null,
      meta: {},
    });

    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    const link = await screen.findByRole('link', { name: 'Ir a Mis programas' });
    expect(link.getAttribute('href')).toBe('/programs');
  });
});
