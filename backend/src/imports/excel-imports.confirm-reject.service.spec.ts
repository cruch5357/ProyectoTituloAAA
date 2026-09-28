import 'reflect-metadata';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExcelImportsService } from './excel-imports.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../auth/auth.constants';

// ---------------------------------------------------------------------------
// PROMPT 14 — Tests de `confirmBatch`/`rejectBatch`.
//
// A diferencia de `excel-imports.service.spec.ts` (que ejercita todo el
// pipeline real de upload/parseo con un .xlsx en memoria), acá se usa una
// mini base de datos en memoria (`FakeDb`) que imita el subconjunto de
// Prisma que `confirmBatch`/`rejectBatch` tocan: `excelImportBatch`,
// `excelImportRow`, `program`, `block`, `week`, `session`,
// `sessionExercise`, `exercise`, más un `$transaction` que de verdad revierte
// los cambios si el callback lanza (vía snapshot/restore) — así el test de
// rollback (RF-20, "nunca dejar una importación parcialmente normalizada")
// es una verificación real, no una suposición.
//
// El `rawData` de cada fila sembrada tiene la MISMA forma exacta que guarda
// `parseAndValidateRows` en producción (`{ cells, normalized }`), para que
// `extractStoredCells()`/`validateExcelRow()` se ejerciten tal cual se
// ejecutan en el flujo real, nunca con un atajo artificial.
// ---------------------------------------------------------------------------

interface FakeBatch {
  id: string;
  coachId: string;
  originalFilename: string;
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED';
  uploadedAt: Date;
  confirmedAt: Date | null;
}

interface FakeRow {
  id: string;
  batchId: string;
  rowNumber: number;
  rawData: unknown;
  status: 'VALID' | 'INVALID';
  errors: unknown;
  resultSessionExerciseId: string | null;
  createdAt: Date;
}

interface FakeExercise {
  id: string;
  coachId: string;
  name: string;
  isActive: boolean;
}

type PlainRecord = Record<string, unknown>;

class FakeDb {
  batches = new Map<string, FakeBatch>();
  rows = new Map<string, FakeRow>();
  exercises = new Map<string, FakeExercise>();
  programs = new Map<string, PlainRecord>();
  blocks = new Map<string, PlainRecord>();
  weeks = new Map<string, PlainRecord>();
  sessions = new Map<string, PlainRecord>();
  sessionExercises = new Map<string, PlainRecord>();
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  snapshot() {
    return structuredClone({
      batches: Array.from(this.batches.entries()),
      rows: Array.from(this.rows.entries()),
      exercises: Array.from(this.exercises.entries()),
      programs: Array.from(this.programs.entries()),
      blocks: Array.from(this.blocks.entries()),
      weeks: Array.from(this.weeks.entries()),
      sessions: Array.from(this.sessions.entries()),
      sessionExercises: Array.from(this.sessionExercises.entries()),
      counter: this.counter,
    });
  }

  restore(snap: ReturnType<FakeDb['snapshot']>): void {
    this.batches = new Map(snap.batches);
    this.rows = new Map(snap.rows);
    this.exercises = new Map(snap.exercises);
    this.programs = new Map(snap.programs);
    this.blocks = new Map(snap.blocks);
    this.weeks = new Map(snap.weeks);
    this.sessions = new Map(snap.sessions);
    this.sessionExercises = new Map(snap.sessionExercises);
    this.counter = snap.counter;
  }
}

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

const BASE_CELLS: PlainRecord = {
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
};

function seedExercise(
  db: FakeDb,
  name: string,
  coachId: string = COACH_ID,
): FakeExercise {
  const id = db.nextId('exercise');
  const exercise: FakeExercise = { id, coachId, name, isActive: true };
  db.exercises.set(id, exercise);
  return exercise;
}

function seedBatch(db: FakeDb, overrides: Partial<FakeBatch> = {}): FakeBatch {
  const id = overrides.id ?? db.nextId('batch');
  const batch: FakeBatch = {
    coachId: COACH_ID,
    originalFilename: 'plan.xlsx',
    status: 'PENDING_REVIEW',
    uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
    confirmedAt: null,
    ...overrides,
    id,
  };
  db.batches.set(id, batch);
  return batch;
}

function seedRow(
  db: FakeDb,
  batchId: string,
  rowNumber: number,
  options: {
    cells?: PlainRecord;
    status?: 'VALID' | 'INVALID';
    errors?: unknown;
  } = {},
): FakeRow {
  const id = db.nextId('row');
  const row: FakeRow = {
    id,
    batchId,
    rowNumber,
    rawData: {
      cells: { ...BASE_CELLS, ...(options.cells ?? {}) },
      normalized: {},
    },
    status: options.status ?? 'VALID',
    errors: options.errors ?? null,
    resultSessionExerciseId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  db.rows.set(id, row);
  return row;
}

function hydrateSessionExercise(db: FakeDb, id: string): PlainRecord | null {
  const sessionExercise = db.sessionExercises.get(id);
  if (!sessionExercise) return null;
  const session = db.sessions.get(sessionExercise.sessionId as string)!;
  const week = db.weeks.get(session.weekId as string)!;
  const block = db.blocks.get(week.blockId as string)!;
  const program = db.programs.get(block.programId as string)!;
  return {
    ...sessionExercise,
    session: { ...session, week: { ...week, block: { ...block, program } } },
  };
}

function hydrateBatch(db: FakeDb, batch: FakeBatch) {
  const rows = Array.from(db.rows.values())
    .filter((row) => row.batchId === batch.id)
    .map((row) => ({
      ...row,
      resultSessionExercise: row.resultSessionExerciseId
        ? hydrateSessionExercise(db, row.resultSessionExerciseId)
        : null,
    }));
  return { ...batch, rows };
}

function buildFakePrisma(db: FakeDb) {
  const excelImportBatch = {
    findUnique: jest.fn(({ where }: { where: { id: string } }) => {
      const batch = db.batches.get(where.id);
      return Promise.resolve(batch ? hydrateBatch(db, batch) : null);
    }),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string; status?: string };
        data: PlainRecord;
      }) => {
        const batch = db.batches.get(where.id);
        if (!batch || (where.status && batch.status !== where.status)) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(batch, data);
        return Promise.resolve({ count: 1 });
      },
    ),
  };

  const excelImportRow = {
    update: jest.fn(
      ({ where, data }: { where: { id: string }; data: PlainRecord }) => {
        const row = db.rows.get(where.id);
        if (!row) {
          return Promise.reject(new Error(`row not found: ${where.id}`));
        }
        Object.assign(row, data);
        return Promise.resolve(row);
      },
    ),
  };

  const program = {
    create: jest.fn(({ data }: { data: PlainRecord }) => {
      const id = db.nextId('program');
      const record = { id, ...data };
      db.programs.set(id, record);
      return Promise.resolve(record);
    }),
  };

  const block = {
    create: jest.fn(({ data }: { data: PlainRecord }) => {
      const id = db.nextId('block');
      const record = { id, ...data };
      db.blocks.set(id, record);
      return Promise.resolve(record);
    }),
  };

  const week = {
    create: jest.fn(({ data }: { data: PlainRecord }) => {
      const id = db.nextId('week');
      const record = { id, ...data };
      db.weeks.set(id, record);
      return Promise.resolve(record);
    }),
  };

  const session = {
    create: jest.fn(({ data }: { data: PlainRecord }) => {
      const id = db.nextId('session');
      const record = { id, ...data };
      db.sessions.set(id, record);
      return Promise.resolve(record);
    }),
  };

  const sessionExercise = {
    create: jest.fn(({ data }: { data: PlainRecord }) => {
      const id = db.nextId('sessionExercise');
      const record = { id, ...data };
      db.sessionExercises.set(id, record);
      return Promise.resolve(record);
    }),
  };

  const exercise = {
    findMany: jest.fn(({ where }: { where: { coachId: string } }) =>
      Promise.resolve(
        Array.from(db.exercises.values()).filter(
          (candidate) =>
            candidate.coachId === where.coachId && candidate.isActive,
        ),
      ),
    ),
  };

  const txLike = {
    excelImportBatch,
    excelImportRow,
    program,
    block,
    week,
    session,
    sessionExercise,
    exercise,
  };

  const $transaction = jest.fn(
    async (callback: (tx: typeof txLike) => unknown) => {
      const snapshot = db.snapshot();
      try {
        return await callback(txLike);
      } catch (error) {
        db.restore(snapshot);
        throw error;
      }
    },
  );

  return { ...txLike, $transaction };
}

let db: FakeDb;
let prisma: ReturnType<typeof buildFakePrisma>;
let auditService: jest.Mocked<AuditService>;
let service: ExcelImportsService;

beforeEach(() => {
  db = new FakeDb();
  prisma = buildFakePrisma(db);
  auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditService>;
  service = new ExcelImportsService(
    prisma as unknown as PrismaService,
    auditService,
  );
  seedExercise(db, 'Sentadilla');
});

describe('ExcelImportsService.confirmBatch', () => {
  it('confirma un batch con una fila válida: crea Program/Block/Week/Session/SessionExercise y marca CONFIRMED', async () => {
    const batch = seedBatch(db);
    const row = seedRow(db, batch.id, 2);

    const result = await service.confirmBatch(COACH_ID, batch.id);

    expect(result.status).toBe('CONFIRMED');
    expect(db.programs.size).toBe(1);
    expect(db.blocks.size).toBe(1);
    expect(db.weeks.size).toBe(1);
    expect(db.sessions.size).toBe(1);
    expect(db.sessionExercises.size).toBe(1);

    const program = Array.from(db.programs.values())[0];
    expect(program.coachId).toBe(COACH_ID);
    expect(program.name).toBe('Hipertrofia 8 semanas');
    expect(result.createdPrograms).toEqual([
      { id: program.id, name: 'Hipertrofia 8 semanas' },
    ]);

    const updatedRow = db.rows.get(row.id)!;
    expect(updatedRow.status).toBe('VALID');
    expect(updatedRow.resultSessionExerciseId).toEqual(
      Array.from(db.sessionExercises.keys())[0],
    );

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: COACH_ID,
        action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_CONFIRMED,
        entityId: batch.id,
      }),
    );
  });

  it('rechaza confirmar un batch sin ninguna fila válida', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, {
      cells: { block_name: undefined },
      status: 'INVALID',
      errors: [{ field: 'block_name', message: 'obligatorio' }],
    });

    await expect(
      service.confirmBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(db.programs.size).toBe(0);
  });

  it('devuelve 404 (nunca 403) para un batch inexistente', async () => {
    await expect(
      service.confirmBatch(COACH_ID, 'batch-inexistente'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devuelve 404 (nunca 403) al intentar confirmar el batch de otro coach (IDOR)', async () => {
    const batch = seedBatch(db, { coachId: OTHER_COACH_ID });
    seedRow(db, batch.id, 2);

    await expect(
      service.confirmBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.programs.size).toBe(0);
  });

  it('rechaza confirmar un batch que ya fue confirmado', async () => {
    const batch = seedBatch(db, {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    });
    seedRow(db, batch.id, 2);

    await expect(
      service.confirmBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza confirmar un batch que ya fue rechazado', async () => {
    const batch = seedBatch(db, { status: 'REJECTED' });
    seedRow(db, batch.id, 2);

    await expect(
      service.confirmBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('es idempotente ante una doble confirmación (doble clic / reenvío)', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2);

    const first = await service.confirmBatch(COACH_ID, batch.id);
    expect(first.status).toBe('CONFIRMED');
    expect(db.programs.size).toBe(1);

    await expect(
      service.confirmBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(ConflictException);
    // La segunda confirmación no debe haber duplicado ninguna entidad.
    expect(db.programs.size).toBe(1);
    expect(db.sessionExercises.size).toBe(1);
  });

  it('agrupa múltiples filas del mismo program_name en un único Program (nunca uno por fila)', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, { cells: { block_order: 1, exercise_order: 1 } });
    seedRow(db, batch.id, 3, { cells: { block_order: 2, exercise_order: 1 } });

    await service.confirmBatch(COACH_ID, batch.id);

    expect(db.programs.size).toBe(1);
    expect(db.blocks.size).toBe(2);
  });

  it('agrupa múltiples filas de la misma Semana en Blocks distintos cuando corresponde', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, {
      cells: { block_order: 1, week_order: 1, exercise_order: 1 },
    });
    seedRow(db, batch.id, 3, {
      cells: { block_order: 1, week_order: 2, exercise_order: 1 },
    });

    await service.confirmBatch(COACH_ID, batch.id);

    expect(db.blocks.size).toBe(1);
    expect(db.weeks.size).toBe(2);
  });

  it('agrupa múltiples filas en Sessions distintas dentro de la misma Semana', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, {
      cells: { session_order: 1, exercise_order: 1 },
    });
    seedRow(db, batch.id, 3, {
      cells: { session_order: 2, exercise_order: 1 },
    });

    await service.confirmBatch(COACH_ID, batch.id);

    expect(db.weeks.size).toBe(1);
    expect(db.sessions.size).toBe(2);
  });

  it('nunca crea una Session nueva por cada ejercicio: agrupa varios ejercicios en una misma Session', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, { cells: { exercise_order: 1 } });
    seedRow(db, batch.id, 3, {
      cells: { exercise_order: 2, exercise_name: 'Peso muerto' },
    });
    seedRow(db, batch.id, 4, {
      cells: { exercise_order: 3, exercise_name: 'Press banca' },
    });
    seedExercise(db, 'Peso muerto');
    seedExercise(db, 'Press banca');

    await service.confirmBatch(COACH_ID, batch.id);

    expect(db.sessions.size).toBe(1);
    expect(db.sessionExercises.size).toBe(3);
  });

  it('respeta los valores explícitos de block_order/week_order/session_order/exercise_order', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, { cells: { exercise_order: 5 } });

    await service.confirmBatch(COACH_ID, batch.id);

    const block = Array.from(db.blocks.values())[0];
    const week = Array.from(db.weeks.values())[0];
    const session = Array.from(db.sessions.values())[0];
    const sessionExercise = Array.from(db.sessionExercises.values())[0];
    expect(block.order).toBe(1);
    expect(week.order).toBe(1);
    expect(session.order).toBe(1);
    expect(sessionExercise.order).toBe(5);
  });

  it('reutiliza el mismo Exercise del catálogo para varias filas sin duplicarlo ni crearlo', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, { cells: { exercise_order: 1 } });
    seedRow(db, batch.id, 3, { cells: { exercise_order: 2 } });

    await service.confirmBatch(COACH_ID, batch.id);

    expect(db.exercises.size).toBe(1);
    const [exerciseId] = Array.from(db.exercises.keys());
    const createdExerciseIds = Array.from(db.sessionExercises.values()).map(
      (se) => se.exerciseId,
    );
    expect(createdExerciseIds).toEqual([exerciseId, exerciseId]);
  });

  it('nunca confirma una fila cuyo ejercicio no existe en el catálogo del coach', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, {
      cells: { exercise_name: 'Ejercicio fantasma' },
    });

    await expect(
      service.confirmBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(db.sessionExercises.size).toBe(0);
  });

  it('deja las filas inválidas sin persistir ninguna entidad, junto a filas válidas del mismo batch', async () => {
    const batch = seedBatch(db);
    const validRow = seedRow(db, batch.id, 2, { cells: { exercise_order: 1 } });
    const invalidRow = seedRow(db, batch.id, 3, {
      cells: { block_name: undefined, exercise_order: 2 },
    });

    const result = await service.confirmBatch(COACH_ID, batch.id);

    expect(result.status).toBe('CONFIRMED');
    expect(db.sessionExercises.size).toBe(1);

    const refreshedValidRow = db.rows.get(validRow.id)!;
    const refreshedInvalidRow = db.rows.get(invalidRow.id)!;
    expect(refreshedValidRow.status).toBe('VALID');
    expect(refreshedValidRow.resultSessionExerciseId).not.toBeNull();
    expect(refreshedInvalidRow.status).toBe('INVALID');
    expect(refreshedInvalidRow.resultSessionExerciseId).toBeNull();
  });

  it('rechaza confirmar cuando dos filas válidas tienen identidades contradictorias en el mismo orden', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, {
      cells: { block_order: 1, block_name: 'Bloque 1' },
    });
    seedRow(db, batch.id, 3, {
      cells: {
        block_order: 1,
        block_name: 'Bloque distinto',
        exercise_order: 2,
      },
    });

    await expect(
      service.confirmBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(db.programs.size).toBe(0);
  });

  it('revierte TODO (rollback completo) si falla la creación de una entidad a mitad de camino', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2, { cells: { block_order: 1, exercise_order: 1 } });
    seedRow(db, batch.id, 3, { cells: { block_order: 2, exercise_order: 1 } });

    let weekCallCount = 0;
    const originalWeekCreate = prisma.week.create.getMockImplementation()!;
    prisma.week.create.mockImplementation((args: { data: PlainRecord }) => {
      weekCallCount += 1;
      if (weekCallCount === 2) {
        throw new Error('falla simulada de base de datos');
      }
      return originalWeekCreate(args);
    });

    await expect(service.confirmBatch(COACH_ID, batch.id)).rejects.toThrow(
      'falla simulada de base de datos',
    );

    expect(db.programs.size).toBe(0);
    expect(db.blocks.size).toBe(0);
    expect(db.weeks.size).toBe(0);
    expect(db.sessions.size).toBe(0);
    expect(db.sessionExercises.size).toBe(0);
    expect(db.batches.get(batch.id)!.status).toBe('PENDING_REVIEW');
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('nunca acepta un coachId ajeno: el Program creado siempre pertenece al coach autenticado', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2);

    await service.confirmBatch(COACH_ID, batch.id);

    const program = Array.from(db.programs.values())[0];
    expect(program.coachId).toBe(COACH_ID);
    expect(program.coachId).not.toBe(OTHER_COACH_ID);
  });
});

describe('ExcelImportsService.rejectBatch', () => {
  it('rechaza un batch pendiente sin generar ninguna entidad de programación', async () => {
    const batch = seedBatch(db);
    seedRow(db, batch.id, 2);

    const result = await service.rejectBatch(COACH_ID, batch.id);

    expect(result.status).toBe('REJECTED');
    expect(db.programs.size).toBe(0);
    expect(db.batches.get(batch.id)!.confirmedAt).toBeNull();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: COACH_ID,
        action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_REJECTED,
        entityId: batch.id,
      }),
    );
  });

  it('devuelve 404 para un batch inexistente', async () => {
    await expect(
      service.rejectBatch(COACH_ID, 'batch-inexistente'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devuelve 404 al intentar rechazar el batch de otro coach (IDOR)', async () => {
    const batch = seedBatch(db, { coachId: OTHER_COACH_ID });

    await expect(
      service.rejectBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza intentar rechazar un batch ya confirmado', async () => {
    const batch = seedBatch(db, {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    });

    await expect(
      service.rejectBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('es idempotente ante un doble rechazo', async () => {
    const batch = seedBatch(db);

    await service.rejectBatch(COACH_ID, batch.id);
    await expect(
      service.rejectBatch(COACH_ID, batch.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
