import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ExcelImportsService } from './excel-imports.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EXCEL_TEMPLATE_COLUMNS } from '../common/imports/excel-template';

type MockTx = {
  excelImportBatch: Record<string, jest.Mock>;
  excelImportRow: Record<string, jest.Mock>;
};

type MockPrisma = MockTx & {
  $transaction: jest.Mock;
  exercise: Record<string, jest.Mock>;
};

function buildMockPrisma(): MockPrisma {
  const tx: MockTx = {
    excelImportBatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    excelImportRow: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return {
    ...tx,
    exercise: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (tx: MockTx) => unknown) => callback(tx)),
  };
}

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

let prisma: MockPrisma;
let auditService: jest.Mocked<AuditService>;
let service: ExcelImportsService;

beforeEach(() => {
  prisma = buildMockPrisma();
  auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditService>;
  service = new ExcelImportsService(
    prisma as unknown as PrismaService,
    auditService,
  );

  let batchCounter = 0;
  prisma.excelImportBatch.create.mockImplementation(
    ({ data }: { data: { coachId: string; originalFilename: string } }) => {
      batchCounter += 1;
      return Promise.resolve({
        id: `batch-${batchCounter}`,
        coachId: data.coachId,
        originalFilename: data.originalFilename,
        status: 'PENDING_REVIEW',
        uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
        confirmedAt: null,
      });
    },
  );

  let rowIdCounter = 0;
  let storedRows: Array<Record<string, unknown>> = [];
  prisma.excelImportRow.createMany.mockImplementation(
    ({ data }: { data: Array<Record<string, unknown>> }) => {
      storedRows = data.map((row) => {
        rowIdCounter += 1;
        return {
          id: `row-${rowIdCounter}`,
          createdAt: new Date(),
          resultSessionExerciseId: null,
          ...row,
        };
      });
      return Promise.resolve({ count: storedRows.length });
    },
  );
  prisma.excelImportRow.findMany.mockImplementation(() =>
    Promise.resolve(storedRows),
  );
});

const FULL_HEADERS = [...EXCEL_TEMPLATE_COLUMNS];

function fullValidRowValues(
  overrides: Record<string, unknown> = {},
): unknown[] {
  const base: Record<string, unknown> = {
    program_name: 'Hipertrofia 8 semanas',
    program_description: 'Programa base',
    duration_weeks: 8,
    block_name: 'Bloque 1',
    block_order: 1,
    week_number: 1,
    week_order: 1,
    session_name: 'Sesión A',
    day_of_week: 1,
    session_order: 1,
    exercise_name: 'Sentadilla',
    exercise_order: 1,
    target_sets: 4,
    target_reps_min: 8,
    target_reps_max: 12,
    target_rpe: 8,
    target_rir: 2,
    rest_seconds: 90,
    notes: 'Tempo controlado',
    ...overrides,
  };
  return FULL_HEADERS.map((column) => base[column]);
}

async function buildXlsxBuffer(
  headers: string[],
  rows: unknown[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Plan');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function buildUploadedFile(
  buffer: Buffer,
  overrides: Record<string, unknown> = {},
) {
  return {
    originalname: 'plan.xlsx',
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
    ...overrides,
  };
}

describe('ExcelImportsService.createFromUpload', () => {
  it('rechaza cuando no se adjunta ningún archivo', async () => {
    await expect(
      service.createFromUpload(COACH_ID, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un archivo que no es un Excel real (contenido no-ZIP)', async () => {
    const buffer = Buffer.from('texto plano, no es un excel');
    await expect(
      service.createFromUpload(COACH_ID, buildUploadedFile(buffer)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza un archivo .xlsm (rechazado explícitamente)', async () => {
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [fullValidRowValues()]);
    await expect(
      service.createFromUpload(
        COACH_ID,
        buildUploadedFile(buffer, { originalname: 'plan.xlsm' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza con extensión .xlsx falsificada sobre contenido no válido', async () => {
    // Extensión correcta, pero el contenido no es un zip real -> lo atrapa
    // la validación de magic bytes, no la de extensión.
    const buffer = Buffer.from('no soy un excel de verdad');
    await expect(
      service.createFromUpload(COACH_ID, buildUploadedFile(buffer)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un archivo corrupto que pasa el magic-byte check pero exceljs no puede parsear', async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from(
        'esto no es una estructura zip/xlsx real y exceljs debe fallar al leerlo, no es suficiente con la firma',
      ),
    ]);
    await expect(
      service.createFromUpload(COACH_ID, buildUploadedFile(corrupt)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza un archivo que excede el tamaño máximo', async () => {
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [fullValidRowValues()]);
    await expect(
      service.createFromUpload(
        COACH_ID,
        buildUploadedFile(buffer, { size: 10 * 1024 * 1024 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza cuando faltan columnas obligatorias en el encabezado', async () => {
    const headersWithoutBlockOrder = FULL_HEADERS.filter(
      (column) => column !== 'block_order',
    );
    const buffer = await buildXlsxBuffer(headersWithoutBlockOrder, []);
    await expect(
      service.createFromUpload(COACH_ID, buildUploadedFile(buffer)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza cuando el encabezado trae una columna desconocida', async () => {
    const buffer = await buildXlsxBuffer(
      [...FULL_HEADERS, 'peso_extra'],
      [[...fullValidRowValues(), 100]],
    );
    await expect(
      service.createFromUpload(COACH_ID, buildUploadedFile(buffer)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta un archivo válido sin filas de datos (solo encabezado)', async () => {
    const buffer = await buildXlsxBuffer(FULL_HEADERS, []);
    const result = await service.createFromUpload(
      COACH_ID,
      buildUploadedFile(buffer),
    );
    expect(result.counts).toEqual({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
    });
  });

  it('omite en silencio las filas completamente vacías (no cuentan ni generan error)', async () => {
    prisma.exercise.findMany.mockResolvedValue([
      { id: 'exercise-1', name: 'Sentadilla' },
    ]);
    const blankRow = FULL_HEADERS.map(() => undefined);
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [
      fullValidRowValues(),
      blankRow,
    ]);
    const result = await service.createFromUpload(
      COACH_ID,
      buildUploadedFile(buffer),
    );
    expect(result.counts.totalRows).toBe(1);
  });

  it('crea filas VALID para prescripciones correctas cuyo ejercicio existe en el catálogo del coach', async () => {
    prisma.exercise.findMany.mockResolvedValue([
      { id: 'exercise-1', name: 'Sentadilla' },
    ]);
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [fullValidRowValues()]);

    const result = await service.createFromUpload(
      COACH_ID,
      buildUploadedFile(buffer),
    );

    expect(result.counts).toEqual({
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
    });
    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { coachId: COACH_ID, isActive: true } }),
    );
  });

  it('marca INVALID una fila cuyo ejercicio no existe en el catálogo, sin crearlo', async () => {
    prisma.exercise.findMany.mockResolvedValue([]);
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [fullValidRowValues()]);

    const result = await service.createFromUpload(
      COACH_ID,
      buildUploadedFile(buffer),
    );

    expect(result.counts).toEqual({
      totalRows: 1,
      validRows: 0,
      invalidRows: 1,
    });
    expect(result.rows[0].errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'exercise_name' }),
      ]),
    );
    // Nunca se llama a exercise.create: el ejercicio inexistente NUNCA se
    // crea automáticamente (PROMPT 13, explícitamente fuera de alcance).
    expect(prisma.exercise.findMany).toHaveBeenCalledTimes(1);
  });

  it('procesa una mezcla de filas válidas e inválidas en el mismo archivo', async () => {
    prisma.exercise.findMany.mockResolvedValue([
      { id: 'exercise-1', name: 'Sentadilla' },
    ]);
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [
      fullValidRowValues(),
      fullValidRowValues({ target_rpe: 99, exercise_order: 2 }),
    ]);

    const result = await service.createFromUpload(
      COACH_ID,
      buildUploadedFile(buffer),
    );

    expect(result.counts).toEqual({
      totalRows: 2,
      validRows: 1,
      invalidRows: 1,
    });
  });

  it('nunca acepta coachId del archivo/cliente: siempre usa el coach autenticado', async () => {
    prisma.exercise.findMany.mockResolvedValue([
      { id: 'exercise-1', name: 'Sentadilla' },
    ]);
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [fullValidRowValues()]);

    await service.createFromUpload(COACH_ID, buildUploadedFile(buffer));

    expect(prisma.excelImportBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ coachId: COACH_ID }),
      }),
    );
  });

  it('registra auditoría al crear el batch, sin incluir contenido del archivo', async () => {
    prisma.exercise.findMany.mockResolvedValue([]);
    const buffer = await buildXlsxBuffer(FULL_HEADERS, [fullValidRowValues()]);

    await service.createFromUpload(COACH_ID, buildUploadedFile(buffer));

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: COACH_ID,
        action: 'excel_imports.batch_created',
        metadata: {
          originalFilename: 'plan.xlsx',
          totalRows: 1,
          validRows: 0,
          invalidRows: 1,
        },
      }),
    );
  });
});

describe('ExcelImportsService.getOwnedPreview', () => {
  it('devuelve la vista previa de un batch propio', async () => {
    prisma.excelImportBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      coachId: COACH_ID,
      originalFilename: 'plan.xlsx',
      status: 'PENDING_REVIEW',
      uploadedAt: new Date(),
      confirmedAt: null,
      rows: [],
    });

    const result = await service.getOwnedPreview(COACH_ID, 'batch-1');

    expect(result.id).toBe('batch-1');
  });

  it('responde 404 (no 403) si el batch no existe', async () => {
    prisma.excelImportBatch.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedPreview(COACH_ID, 'batch-inexistente'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 404 (no 403) si el batch pertenece a otro coach (anti-IDOR)', async () => {
    prisma.excelImportBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      coachId: OTHER_COACH_ID,
      originalFilename: 'plan.xlsx',
      status: 'PENDING_REVIEW',
      uploadedAt: new Date(),
      confirmedAt: null,
      rows: [],
    });

    await expect(
      service.getOwnedPreview(COACH_ID, 'batch-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
