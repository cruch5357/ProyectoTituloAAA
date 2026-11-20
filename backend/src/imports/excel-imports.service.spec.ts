import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ExcelImportsService } from './excel-imports.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../auth/auth.constants';

// Base de datos en memoria con el subconjunto de Prisma que usa el
// servicio. `$transaction` revierte de verdad si el callback falla, así la
// prueba de "nunca deja una importación a medias" es real.
type Rec = Record<string, any>;

class FakeDb {
  tables: Record<string, Map<string, Rec>> = {};
  private counter = 0;
  constructor() {
    for (const name of [
      'batches',
      'rows',
      'exercises',
      'blocks',
      'weeks',
      'sessions',
      'sessionExercises',
      'programmedSets',
    ])
      this.tables[name] = new Map();
  }
  id(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }
  insert(table: string, data: Rec) {
    const record = { id: this.id(table), ...data };
    this.tables[table].set(record.id, record);
    return record;
  }
  all(table: string) {
    return [...this.tables[table].values()];
  }
  snapshot() {
    return structuredClone({ tables: this.tables, counter: this.counter });
  }
  restore(snap: ReturnType<FakeDb['snapshot']>) {
    this.tables = snap.tables;
    this.counter = snap.counter;
  }
}

const COACH = 'coach-1';
const OTHER_COACH = 'coach-2';

function buildPrisma(db: FakeDb) {
  const withResult = (row: Rec) => {
    const se = row.resultSessionExerciseId
      ? db.tables.sessionExercises.get(row.resultSessionExerciseId)
      : null;
    if (!se) return { ...row, resultSessionExercise: null };
    const session = db.tables.sessions.get(se.sessionId)!;
    const week = db.tables.weeks.get(session.weekId)!;
    const block = db.tables.blocks.get(week.blockId)!;
    return {
      ...row,
      resultSessionExercise: {
        ...se,
        session: {
          ...session,
          week: { ...week, block: { ...block, program: null } },
        },
      },
    };
  };
  const rowsOf = (batchId: string) =>
    db
      .all('rows')
      .filter((row) => row.batchId === batchId)
      .map(withResult);
  const prisma: Rec = {
    exercise: {
      findMany: jest.fn(async ({ where }) =>
        db
          .all('exercises')
          .filter((e) => e.coachId === where.coachId && e.isActive)
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    },
    block: {
      findMany: jest.fn(async ({ where }) =>
        db
          .all('blocks')
          .filter((b) => b.coachId === where.coachId && b.programId === null),
      ),
      create: jest.fn(async ({ data }) =>
        db.insert('blocks', { programId: null, ...data }),
      ),
    },
    week: { create: jest.fn(async ({ data }) => db.insert('weeks', data)) },
    session: {
      create: jest.fn(async ({ data }) => db.insert('sessions', data)),
    },
    sessionExercise: {
      create: jest.fn(async ({ data }) => {
        const { programmedSets, ...rest } = data;
        const se = db.insert('sessionExercises', rest);
        for (const set of programmedSets.create)
          db.insert('programmedSets', { sessionExerciseId: se.id, ...set });
        return se;
      }),
    },
    excelImportBatch: {
      create: jest.fn(async ({ data }) =>
        db.insert('batches', {
          status: 'PENDING_REVIEW',
          uploadedAt: new Date('2026-11-20T10:00:00Z'),
          confirmedAt: null,
          ...data,
        }),
      ),
      findUnique: jest.fn(async ({ where }) => {
        const batch = db.tables.batches.get(where.id);
        return batch ? { ...batch, rows: rowsOf(batch.id) } : null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const batch = db.tables.batches.get(where.id);
        if (!batch || batch.status !== where.status) return { count: 0 };
        Object.assign(batch, data);
        return { count: 1 };
      }),
    },
    excelImportRow: {
      createMany: jest.fn(async ({ data }) => {
        for (const row of data)
          db.insert('rows', { resultSessionExerciseId: null, ...row });
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }) => rowsOf(where.batchId)),
      update: jest.fn(async ({ where, data }) =>
        Object.assign(db.tables.rows.get(where.id)!, data),
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        for (const id of where.id.in)
          Object.assign(db.tables.rows.get(id)!, data);
        return { count: where.id.in.length };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const snap = db.snapshot();
    try {
      return await (arg as (tx: Rec) => unknown)(prisma);
    } catch (error) {
      db.restore(snap);
      throw error;
    }
  });
  return prisma;
}

let db: FakeDb;
let prisma: Rec;
let audit: { record: jest.Mock };
let service: ExcelImportsService;

beforeEach(() => {
  db = new FakeDb();
  prisma = buildPrisma(db);
  audit = { record: jest.fn().mockResolvedValue(undefined) };
  service = new ExcelImportsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  for (const name of [
    'Sentadilla',
    'Press banca',
    'Remo con barra',
    'Peso muerto',
  ])
    db.insert('exercises', { coachId: COACH, name, isActive: true });
});

const HEADERS = [
  'Bloque',
  'Semana',
  'Día',
  'Ejercicio',
  'Series',
  'Reps',
  'Carga (kg)',
  'RPE',
  'Notas',
];

async function xlsx(rows: unknown[][], headers = HEADERS): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Planificación');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const file = (buffer: Buffer) => ({
  originalname: 'plan.xlsx',
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: buffer.length,
  buffer,
});

const upload = async (rows: unknown[][], headers?: string[]) =>
  service.createFromUpload(COACH, file(await xlsx(rows, headers)));

const VALID_ROWS = [
  ['Fuerza base', 1, 'Día A', 'Sentadilla', 3, 8, 60, 7, 'Bajar lento'],
  ['Fuerza base', 1, 'Día A', 'Press banca', 3, 10, 40, 7],
  ['Fuerza base', 1, 'Día B', 'Peso muerto', 1, 5, 80, 8],
  ['Fuerza base', 1, 'Día B', 'Peso muerto', 1, 3, 90, 9],
  ['Fuerza base', 2, 'Día A', 'Sentadilla', 3, 8, 62.5, 7.5],
];

type RowError = { field: string; cell?: string; message: string };
const errorsOf = (
  batch: { rows: Array<{ rowNumber: number; errors: unknown }> },
  rowNumber: number,
) =>
  (batch.rows.find((row) => row.rowNumber === rowNumber)?.errors ??
    []) as RowError[];

describe('subir y previsualizar', () => {
  it('un archivo correcto muestra los bloques que se crearán', async () => {
    const batch = await upload(VALID_ROWS);
    expect(batch.status).toBe('PENDING_REVIEW');
    expect(batch.counts).toEqual({
      totalRows: 5,
      validRows: 5,
      invalidRows: 0,
    });
    expect(batch.plan).toEqual([
      {
        name: 'Fuerza base',
        weeks: 2,
        days: 3,
        exercises: 4,
        sets: 11,
        alreadyExists: false,
      },
    ]);
    expect(batch.legacyTemplate).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_CREATED,
      }),
    );
  });

  it('la plantilla descargada se puede subir tal cual', async () => {
    const template = await service.buildTemplate(COACH);
    const batch = await service.createFromUpload(COACH, file(template));
    expect(batch.counts.invalidRows).toBe(0);
    expect(batch.plan).toHaveLength(1);
    expect(batch.counts.totalRows).toBe(1);
    expect(batch.plan[0]).toMatchObject({
      name: 'Fuerza base',
      weeks: 1,
      days: 1,
      exercises: 1,
      sets: 3,
    });
  });

  it('la plantilla trae la lista de ejercicios del coach en la columna Ejercicio', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await service.buildTemplate(COACH)) as unknown as ExcelJS.Buffer,
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Planificación',
      'Instrucciones',
      'Mis ejercicios',
    ]);
    const plan = workbook.getWorksheet('Planificación')!;
    expect(plan.getRow(1).values).toEqual([undefined, ...HEADERS]);
    expect(plan.getCell('D2').dataValidation).toMatchObject({
      type: 'list',
      formulae: ["'Mis ejercicios'!$A$2:$A$5"],
    });
    const catalog = workbook.getWorksheet('Mis ejercicios')!;
    expect(catalog.getColumn(1).values.slice(2)).toEqual([
      'Peso muerto',
      'Press banca',
      'Remo con barra',
      'Sentadilla',
    ]);
  });

  it('indica la celda exacta y sugiere el ejercicio correcto', async () => {
    const batch = await upload([
      VALID_ROWS[0],
      ['Fuerza base', 1, 'Día A', 'Sentadila', 3, 8, 60, 7],
    ]);
    expect(batch.counts.invalidRows).toBe(1);
    expect(batch.plan).toEqual([]);
    expect(errorsOf(batch, 3)).toEqual([
      {
        field: 'exercise_name',
        cell: 'D3',
        message:
          '"Sentadila" no está en tu catálogo de ejercicios. ¿Quisiste decir "Sentadilla"?',
      },
    ]);
  });

  it('un nombre de bloque escrito distinto bloquea la importación con su celda', async () => {
    const batch = await upload([
      VALID_ROWS[0],
      ['fuerza base', 1, 'Día A', 'Press banca', 3, 10, 40, 7],
    ]);
    const [error] = errorsOf(batch, 3);
    expect(error).toMatchObject({ field: 'block_name', cell: 'A3' });
    expect(error.message).toContain(
      'pero en la fila 2 se escribió "Fuerza base"',
    );
    expect(error.message).toContain('el Excel no se puede importar');
  });

  it('las celdas en otra posición usan su propia letra', async () => {
    const batch = await upload(
      [['Sentadilla', 'Fuerza base', 1, 'Día A', 'nueve']],
      ['Ejercicio', 'Bloque', 'Semana', 'Día', 'Series'],
    );
    expect(errorsOf(batch, 2)).toEqual([
      expect.objectContaining({ field: 'sets', cell: 'E2' }),
    ]);
  });

  it('Bloque, Semana y Día vacíos repiten la fila de arriba', async () => {
    const batch = await upload([
      ['Fuerza base', 1, 'Día A', 'Sentadilla', 3, 8],
      [null, null, null, 'Press banca', 3, 10],
      [null, null, 'Día B', 'Peso muerto', 2, 5],
    ]);
    expect(batch.counts.invalidRows).toBe(0);
    expect(batch.plan[0]).toMatchObject({ weeks: 1, days: 2, exercises: 3 });
  });

  it('acepta encabezados alternativos (Peso, Sesión, Repeticiones)', async () => {
    const batch = await upload(
      [['Base', 1, 'Día A', 'Sentadilla', 50, 8]],
      ['Bloque', 'Semana', 'Sesión', 'Ejercicio', 'Peso', 'Repeticiones'],
    );
    expect(batch.counts.invalidRows).toBe(0);
    expect(batch.rows[0].data).toMatchObject({ weight: 50, reps: 8, sets: 1 });
  });

  it('avisa si ya existe un bloque con el mismo nombre', async () => {
    db.insert('blocks', {
      coachId: COACH,
      programId: null,
      name: 'Fuerza Base',
    });
    const batch = await upload(VALID_ROWS);
    expect(batch.plan[0].alreadyExists).toBe(true);
  });

  it('reconoce la plantilla anterior y pide descargar la nueva', async () => {
    await expect(
      upload([['Programa X', 'Bloque', 1]], ['Programa', 'Bloque', 'Semana']),
    ).rejects.toThrow(/plantilla anterior/);
  });

  it('explica qué columna falta o sobra, con su letra', async () => {
    const error = await upload(
      [['Base', 1]],
      ['Bloque', 'Semana', 'Color'],
    ).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('Falta la columna obligatoria "Día".');
    expect(error.message).toContain(
      'Falta la columna obligatoria "Ejercicio".',
    );
    expect(error.message).toContain(
      '"Color" (columna C) no pertenece a la plantilla',
    );
  });

  it('rechaza una hoja sin filas de datos', async () => {
    await expect(upload([])).rejects.toThrow(/no tiene filas con datos/);
  });

  it('exige adjuntar un archivo', async () => {
    await expect(service.createFromUpload(COACH, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('otro coach no puede ver la importación', async () => {
    const batch = await upload(VALID_ROWS);
    await expect(
      service.getOwnedPreview(OTHER_COACH, batch.id),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('confirmar', () => {
  it('crea el bloque en la biblioteca con semanas, días, ejercicios y series', async () => {
    const uploaded = await upload(VALID_ROWS);
    const batch = await service.confirmBatch(COACH, uploaded.id);

    expect(batch.status).toBe('CONFIRMED');
    const [block] = db.all('blocks');
    expect(block).toMatchObject({
      coachId: COACH,
      programId: null,
      name: 'Fuerza base',
      order: 1,
    });
    expect(batch.createdBlocks).toEqual([
      { id: block.id, name: 'Fuerza base', programId: null },
    ]);
    expect(db.all('weeks').map((w) => [w.number, w.order])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(db.all('sessions').map((s) => s.name)).toEqual([
      'Día A',
      'Día B',
      'Día A',
    ]);
    const deadlift = db
      .all('sessionExercises')
      .find((se) => se.order === 1 && se.targetSets === 2)!;
    expect(
      db
        .all('programmedSets')
        .filter((set) => set.sessionExerciseId === deadlift.id),
    ).toEqual([
      expect.objectContaining({ order: 1, weight: 80, reps: 5, rpe: 8 }),
      expect.objectContaining({ order: 2, weight: 90, reps: 3, rpe: 9 }),
    ]);
    // Las dos filas de la pirámide apuntan al mismo ejercicio creado.
    expect(
      batch.rows.filter((row) => row.resultSessionExerciseId === deadlift.id),
    ).toHaveLength(2);
    expect(batch.rows.every((row) => row.resultSessionExerciseId)).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_CONFIRMED,
        metadata: expect.objectContaining({
          blocksCreated: 1,
          weeksCreated: 2,
          daysCreated: 3,
          exercisesCreated: 4,
          setsCreated: 11,
        }),
      }),
    );
  });

  it('no confirma si alguna fila tiene errores', async () => {
    const uploaded = await upload([
      VALID_ROWS[0],
      ['Fuerza base', 1, 'Día A', 'Burpee'],
    ]);
    await expect(service.confirmBatch(COACH, uploaded.id)).rejects.toThrow(
      'No se puede importar: hay 1 fila con errores. Corrígelas en tu Excel y súbelo otra vez.',
    );
    expect(db.all('blocks')).toEqual([]);
    expect(db.tables.batches.get(uploaded.id)!.status).toBe('PENDING_REVIEW');
  });

  it('vuelve a revisar el catálogo: un ejercicio desactivado después bloquea la confirmación', async () => {
    const uploaded = await upload(VALID_ROWS);
    db.all('exercises').find((e) => e.name === 'Press banca')!.isActive = false;
    await expect(service.confirmBatch(COACH, uploaded.id)).rejects.toThrow(
      UnprocessableEntityException,
    );
    const preview = await service.getOwnedPreview(COACH, uploaded.id);
    expect(errorsOf(preview, 3)).toEqual([
      expect.objectContaining({ field: 'exercise_name', cell: 'D3' }),
    ]);
    expect(db.all('blocks')).toEqual([]);
  });

  it('si algo falla a mitad, no queda nada creado y sigue pendiente', async () => {
    const uploaded = await upload(VALID_ROWS);
    prisma.sessionExercise.create.mockRejectedValueOnce(new Error('falla'));
    await expect(service.confirmBatch(COACH, uploaded.id)).rejects.toThrow(
      'falla',
    );
    expect(db.all('blocks')).toEqual([]);
    expect(db.all('sessions')).toEqual([]);
    expect(db.tables.batches.get(uploaded.id)!.status).toBe('PENDING_REVIEW');
  });

  it('no se puede confirmar dos veces ni después de rechazar', async () => {
    const first = await upload(VALID_ROWS);
    await service.confirmBatch(COACH, first.id);
    await expect(service.confirmBatch(COACH, first.id)).rejects.toThrow(
      ConflictException,
    );
    expect(db.all('blocks')).toHaveLength(1);

    const second = await upload(VALID_ROWS);
    await service.rejectBatch(COACH, second.id);
    await expect(service.confirmBatch(COACH, second.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('una importación hecha con la plantilla anterior pide volver a subirla', async () => {
    const batch = db.insert('batches', {
      coachId: COACH,
      originalFilename: 'viejo.xlsx',
      status: 'PENDING_REVIEW',
      uploadedAt: new Date(),
      confirmedAt: null,
    });
    db.insert('rows', {
      batchId: batch.id,
      rowNumber: 2,
      status: 'VALID',
      errors: null,
      resultSessionExerciseId: null,
      rawData: {
        cells: {},
        normalized: { programName: 'X', sessionName: 'A' },
      },
    });
    const preview = await service.getOwnedPreview(COACH, batch.id);
    expect(preview.legacyTemplate).toBe(true);
    await expect(service.confirmBatch(COACH, batch.id)).rejects.toThrow(
      /plantilla anterior/,
    );
  });

  it('otro coach no puede confirmar', async () => {
    const uploaded = await upload(VALID_ROWS);
    await expect(
      service.confirmBatch(OTHER_COACH, uploaded.id),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('rechazar', () => {
  it('cierra la importación sin crear bloques', async () => {
    const uploaded = await upload(VALID_ROWS);
    const batch = await service.rejectBatch(COACH, uploaded.id);
    expect(batch.status).toBe('REJECTED');
    expect(batch.plan).toEqual([]);
    expect(db.all('blocks')).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_REJECTED,
      }),
    );
    await expect(service.rejectBatch(COACH, uploaded.id)).rejects.toThrow(
      ConflictException,
    );
  });
});
