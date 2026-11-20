import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ImportExcelPage } from './ImportExcelPage';
import type { ExcelImportBatch, ExcelImportRow } from '../../types/excelImport';

function buildBatch(
  overrides: Partial<ExcelImportBatch> = {},
): ExcelImportBatch {
  return {
    id: 'batch-1',
    originalFilename: 'plan.xlsx',
    status: 'PENDING_REVIEW',
    uploadedAt: '2026-11-20T10:00:00.000Z',
    confirmedAt: null,
    counts: { totalRows: 0, validRows: 0, invalidRows: 0 },
    rows: [],
    legacyTemplate: false,
    plan: [],
    createdBlocks: [],
    ...overrides,
  };
}

const validRow: ExcelImportRow = {
  id: 'row-1',
  rowNumber: 2,
  status: 'VALID',
  errors: null,
  data: {
    blockName: 'Fuerza base',
    weekNumber: 1,
    dayName: 'Día A',
    exerciseName: 'Sentadilla',
    sets: 3,
    reps: 8,
    weight: 62.5,
    rpe: 7,
  },
  resultSessionExerciseId: null,
};

const invalidRow: ExcelImportRow = {
  id: 'row-2',
  rowNumber: 3,
  status: 'INVALID',
  errors: [
    {
      field: 'exercise_name',
      cell: 'D3',
      message:
        '"Sentadila" no está en tu catálogo de ejercicios. ¿Quisiste decir "Sentadilla"?',
    },
  ],
  data: {
    blockName: 'Fuerza base',
    weekNumber: 1,
    dayName: 'Día A',
    exerciseName: 'Sentadila',
  },
  resultSessionExerciseId: null,
};

const readyBatch = buildBatch({
  counts: { totalRows: 1, validRows: 1, invalidRows: 0 },
  rows: [validRow],
  plan: [
    {
      name: 'Fuerza base',
      weeks: 2,
      days: 3,
      exercises: 4,
      sets: 11,
      alreadyExists: false,
    },
  ],
});

const batchWithErrors = buildBatch({
  counts: { totalRows: 2, validRows: 1, invalidRows: 1 },
  rows: [validRow, invalidRow],
});

const xlsxFile = (name = 'plan.xlsx', size = 1024) =>
  new File([new Uint8Array(size)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

async function uploadPreview(batch: ExcelImportBatch) {
  const user = userEvent.setup();
  vi.spyOn(apiClient, 'postFile').mockResolvedValue({
    data: batch,
    error: null,
    meta: {},
  });
  renderWithProviders(<ImportExcelPage />);
  await user.upload(screen.getByLabelText('Archivo Excel (.xlsx)'), xlsxFile());
  await user.click(screen.getByRole('button', { name: 'Subir archivo' }));
  await screen.findByText(`Revisión de ${batch.originalFilename}`);
  return user;
}

function mockCatalog(exercises: Array<{ id: string; name: string }>) {
  return vi
    .spyOn(apiClient, 'get')
    .mockImplementation(async (path) =>
      path === '/block-library/catalog'
        ? { data: { exercises, modifiers: [] }, error: null, meta: {} }
        : { data: null, error: null, meta: {} },
    );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockCatalog([{ id: 'ex-1', name: 'Sentadilla' }]);
});

describe('Importar Excel - coach sin ejercicios', () => {
  it('avisa que no tiene ejercicios y ofrece crear uno o cerrar', async () => {
    const user = userEvent.setup();
    mockCatalog([]);
    renderWithProviders(<ImportExcelPage />);
    const dialog = await screen.findByRole('dialog', {
      name: 'No tienes ejercicios ingresados',
    });
    expect(dialog).toHaveAttribute('open');
    expect(
      within(dialog).getByRole('link', { name: 'Crear ejercicio' }),
    ).toHaveAttribute('href', '/exercises?nuevo=1');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('no muestra el aviso si tiene ejercicios', async () => {
    renderWithProviders(<ImportExcelPage />);
    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/block-library/catalog'),
    );
    expect(
      screen.queryByRole('dialog', { name: 'No tienes ejercicios ingresados' }),
    ).toBeNull();
  });
});

describe('Importar Excel - antes de subir', () => {
  it('explica los pasos y la regla de escribir los nombres igual', () => {
    renderWithProviders(<ImportExcelPage />);
    expect(
      screen.getByText('Escribe una fila por ejercicio.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'escribe el nombre de cada bloque y de cada día exactamente igual en todas sus filas',
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'el Excel no se puede importar',
    );
  });

  it('habilita la subida solo con un .xlsx válido', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportExcelPage />);
    expect(
      screen.getByRole('button', { name: 'Subir archivo' }),
    ).toBeDisabled();
    await user.upload(
      screen.getByLabelText('Archivo Excel (.xlsx)'),
      xlsxFile(),
    );
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeEnabled();
  });

  it('rechaza otra extensión o un archivo muy grande sin subirlo', async () => {
    const postFile = vi.spyOn(apiClient, 'postFile');
    renderWithProviders(<ImportExcelPage />);
    const input = screen.getByLabelText('Archivo Excel (.xlsx)');
    fireEvent.change(input, { target: { files: [xlsxFile('plan.xlsm')] } });
    expect(
      screen.getByText(/Solo se aceptan archivos \.xlsx/),
    ).toBeInTheDocument();
    fireEvent.change(input, {
      target: { files: [xlsxFile('plan.xlsx', 6 * 1024 * 1024)] },
    });
    expect(screen.getByText(/supera el tamaño máximo/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Subir archivo' }),
    ).toBeDisabled();
    expect(postFile).not.toHaveBeenCalled();
  });

  it('descarga la plantilla desde el backend', async () => {
    const user = userEvent.setup();
    const blob = vi
      .spyOn(apiClient, 'blob')
      .mockResolvedValue(new Blob(['xlsx']));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    renderWithProviders(<ImportExcelPage />);
    await user.click(
      screen.getByRole('button', { name: 'Descargar plantilla' }),
    );
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(blob).toHaveBeenCalledWith('/imports/excel/template');
    vi.unstubAllGlobals();
  });
});

describe('Importar Excel - revisión', () => {
  it('con errores, lista fila, celda y columna, y no deja confirmar', async () => {
    await uploadPreview(batchWithErrors);
    const errors = screen.getByRole('alert');
    expect(errors).toHaveTextContent(
      'Corrige 1 fila en tu Excel antes de importar',
    );
    expect(
      within(errors).getByText('Fila 3 · celda D3 (Ejercicio):'),
    ).toBeInTheDocument();
    expect(errors).toHaveTextContent('¿Quisiste decir "Sentadilla"?');
    expect(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    ).toBeDisabled();
    expect(screen.getByText('Corregir D3')).toBeInTheDocument();
  });

  it('sin errores, resume los bloques que se crearán y permite confirmar', async () => {
    await uploadPreview(readyBatch);
    expect(
      screen.getByText('Todo correcto. Se crearán estos bloques:'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' &&
          element.textContent ===
            'Fuerza base: 2 semanas · 3 días · 4 ejercicios · 11 series',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    ).toBeEnabled();
    expect(screen.getByText('3 × 8 · 62,5 kg · RPE 7')).toBeInTheDocument();
  });

  it('avisa si ya existe un bloque con ese nombre', async () => {
    await uploadPreview(
      buildBatch({
        ...readyBatch,
        plan: [{ ...readyBatch.plan[0], alreadyExists: true }],
      }),
    );
    expect(
      screen.getByText(/Ya tienes un bloque con este nombre/),
    ).toBeInTheDocument();
  });

  it('pide la plantilla nueva para una importación antigua', async () => {
    await uploadPreview(buildBatch({ ...readyBatch, legacyTemplate: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('plantilla anterior');
    expect(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    ).toBeDisabled();
  });

  it('muestra el mensaje del backend si el archivo no respeta la plantilla', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'postFile').mockRejectedValue(
      new ApiError(400, 'Falta la columna obligatoria "Día".'),
    );
    renderWithProviders(<ImportExcelPage />);
    await user.upload(
      screen.getByLabelText('Archivo Excel (.xlsx)'),
      xlsxFile(),
    );
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }));
    expect(
      await screen.findByText('Falta la columna obligatoria "Día".'),
    ).toBeInTheDocument();
  });
});

describe('Importar Excel - confirmar y descartar', () => {
  it('confirma y enlaza a los bloques creados', async () => {
    const user = await uploadPreview(readyBatch);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: buildBatch({
        ...readyBatch,
        status: 'CONFIRMED',
        plan: [],
        createdBlocks: [
          { id: 'block-9', name: 'Fuerza base', programId: null },
        ],
      }),
      error: null,
      meta: {},
    });
    await user.click(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    );
    expect(post).toHaveBeenCalledWith('/imports/excel/batch-1/confirm');
    expect(
      await screen.findByText('Importación confirmada'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir y editar' }),
    ).toHaveAttribute('href', '/block-library/block-9');
    expect(screen.getByRole('link', { name: 'Ir a Bloques' })).toHaveAttribute(
      'href',
      '/blocks',
    );
    expect(
      screen.queryByRole('button', { name: 'Confirmar importación' }),
    ).not.toBeInTheDocument();
  });

  it('si la confirmación encuentra errores nuevos, muestra el motivo y recarga la revisión', async () => {
    const user = await uploadPreview(readyBatch);
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError(
        422,
        'No se puede importar: hay 1 fila con errores. Corrígelas en tu Excel y súbelo otra vez.',
      ),
    );
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: batchWithErrors,
      error: null,
      meta: {},
    });
    await user.click(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    );
    expect(
      await screen.findByText(/hay 1 fila con errores/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Fila 3 · celda D3 (Ejercicio):'),
    ).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/imports/excel/batch-1');
  });

  it('descarta la importación tras confirmar en el diálogo', async () => {
    const user = await uploadPreview(readyBatch);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: buildBatch({ status: 'REJECTED' }),
      error: null,
      meta: {},
    });
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(post).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', {
      name: 'Confirmar rechazo',
      hidden: true,
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Descartar', hidden: true }),
    );
    expect(post).toHaveBeenCalledWith('/imports/excel/batch-1/reject');
    expect(
      await screen.findByText('Importación descartada'),
    ).toBeInTheDocument();
  });
});
