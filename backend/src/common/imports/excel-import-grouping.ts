// Agrupación de filas válidas de un Excel en la jerarquía relacional real
// (PROMPT 14, RF-19/RF-20 — segunda mitad de la importación). Función PURA
// y reutilizable, mismo criterio que `excel-row-validation.ts`: no toca
// Prisma, recibe filas ya normalizadas y devuelve un plan listo para
// persistir, o la lista de conflictos que impiden construirlo.
//
// REGLA DE AGRUPACIÓN (documentada acá porque es la fuente de verdad
// ejecutable — ver también docs/api.md, sección 16): varias filas de UN
// MISMO batch pueden pertenecer al mismo Program/Block/Week/Session. La
// identidad de cada nivel, DENTRO de esta única importación, es:
//
// - Program: `program_name` (normalizado: recortado y en minúsculas).
// - Block:   (Program, `block_order`) — el `order` es la identidad real
//   porque es lo que el schema exige único (`@@unique([programId, order])`);
//   `block_name` debe coincidir en todas las filas que comparten ese
//   `block_order` dentro del mismo programa, o se reporta un conflicto.
// - Week:    (Block, `week_order`) — mismo criterio, `week_number` debe
//   coincidir entre filas que comparten `week_order` dentro del mismo bloque.
// - Session: (Week, `session_order`) — `session_name` y `day_of_week` deben
//   coincidir entre filas que comparten `session_order` dentro de la misma
//   semana.
// - SessionExercise: cada fila válida es una prescripción propia dentro de
//   su Session; dos filas de la misma Session no pueden declarar el mismo
//   `exercise_order` (se reporta un conflicto, nunca se renumera sola).
//
// IMPORTANTE — alcance deliberado: esta agrupación SOLO deduplica dentro de
// las filas de la MISMA importación. Nunca busca ni reutiliza un Program ya
// existente del coach con el mismo nombre: cada confirmación exitosa crea
// SIEMPRE un Program nuevo (uno por cada `program_name` distinto presente en
// el archivo). Esto evita el riesgo de fusionar silenciosamente una
// importación con un programa que el coach ya tenía armado a mano por
// coincidencia de nombre — el mismo espíritu conservador que PROMPT 13 ya
// aplicó a "nunca crear/modificar un Exercise existente sin que el coach lo
// pida explícitamente".
//
// `program_description`/`duration_weeks` NO son identidad (son atributos
// descriptivos del Program, no aparecen en ningún otro nivel): se usa el
// valor de la PRIMERA fila (por `rowNumber`) que abre cada grupo de Program;
// si otra fila del mismo programa trae un valor distinto, se ignora en
// silencio (no es un conflicto, a diferencia de nombre/orden/número, que sí
// determinan la forma de la jerarquía).
import type { ExcelTemplateColumn } from './excel-template';

export interface NormalizedRowInput {
  rowId: string;
  rowNumber: number;
  // Ejercicio ya resuelto contra el catálogo ACTUAL del coach autenticado
  // (ver ExcelImportsService) — esta función nunca resuelve nombres, solo
  // recibe el resultado ya resuelto.
  exerciseId: string;
  values: {
    programName: string;
    programDescription?: string;
    durationWeeks?: number;
    blockName: string;
    blockOrder: number;
    weekNumber: number;
    weekOrder: number;
    sessionName: string;
    dayOfWeek?: number;
    sessionOrder: number;
    exerciseOrder: number;
    targetSets?: number;
    targetRepsMin?: number;
    targetRepsMax?: number;
    targetRpe?: number;
    targetRir?: number;
    restSeconds?: number;
    notes?: string;
  };
}

export interface GroupingConflict {
  code: string;
  field: ExcelTemplateColumn;
  message: string;
}

export interface ImportPlanSessionExercise {
  rowId: string;
  rowNumber: number;
  exerciseId: string;
  order: number;
  targetSets?: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetRpe?: number;
  targetRir?: number;
  restSeconds?: number;
  notes?: string;
}

export interface ImportPlanSession {
  order: number;
  name: string;
  dayOfWeek?: number;
  exercises: ImportPlanSessionExercise[];
}

export interface ImportPlanWeek {
  order: number;
  number: number;
  sessions: ImportPlanSession[];
}

export interface ImportPlanBlock {
  order: number;
  name: string;
  weeks: ImportPlanWeek[];
}

export interface ImportPlanProgram {
  name: string;
  description?: string;
  durationWeeks?: number;
  blocks: ImportPlanBlock[];
}

export type BuildImportPlanResult =
  | { plan: ImportPlanProgram[]; conflicts?: never }
  | { plan?: never; conflicts: GroupingConflict[] };

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

// Estructuras internas con Map para deduplicar en O(1); se convierten a
// arreglos ordenados por `order` recién al final, para que el plan resultante
// sea determinista sin importar el orden de llegada de las filas (siempre se
// itera por `rowNumber` ascendente antes de construir el plan).
interface MutableSession extends Omit<ImportPlanSession, 'exercises'> {
  exercises: ImportPlanSessionExercise[];
  sourceRowNumber: number;
}
interface MutableWeek extends Omit<ImportPlanWeek, 'sessions'> {
  sessions: Map<number, MutableSession>;
  sourceRowNumber: number;
}
interface MutableBlock extends Omit<ImportPlanBlock, 'weeks'> {
  weeks: Map<number, MutableWeek>;
  sourceRowNumber: number;
}
interface MutableProgram extends Omit<ImportPlanProgram, 'blocks'> {
  blocks: Map<number, MutableBlock>;
}

export function buildImportPlan(rows: NormalizedRowInput[]): BuildImportPlanResult {
  const conflicts: GroupingConflict[] = [];
  const programs = new Map<string, MutableProgram>();

  const sortedRows = rows.slice().sort((a, b) => a.rowNumber - b.rowNumber);

  for (const row of sortedRows) {
    const v = row.values;
    const programKey = normalizeKey(v.programName);
    let program = programs.get(programKey);
    if (!program) {
      program = {
        name: v.programName,
        description: v.programDescription,
        durationWeeks: v.durationWeeks,
        blocks: new Map(),
      };
      programs.set(programKey, program);
    }

    let block = program.blocks.get(v.blockOrder);
    if (!block) {
      block = {
        order: v.blockOrder,
        name: v.blockName,
        weeks: new Map(),
        sourceRowNumber: row.rowNumber,
      };
      program.blocks.set(v.blockOrder, block);
    } else if (block.name !== v.blockName) {
      conflicts.push({
        code: 'BLOCK_IDENTITY_CONFLICT',
        field: 'block_name',
        message: `Fila ${row.rowNumber}: el bloque de orden ${v.blockOrder} del programa "${program.name}" ya se identificó como "${block.name}" en la fila ${block.sourceRowNumber}, pero esta fila trae "${v.blockName}".`,
      });
      continue;
    }

    let week = block.weeks.get(v.weekOrder);
    if (!week) {
      week = {
        order: v.weekOrder,
        number: v.weekNumber,
        sessions: new Map(),
        sourceRowNumber: row.rowNumber,
      };
      block.weeks.set(v.weekOrder, week);
    } else if (week.number !== v.weekNumber) {
      conflicts.push({
        code: 'WEEK_IDENTITY_CONFLICT',
        field: 'week_number',
        message: `Fila ${row.rowNumber}: la semana de orden ${v.weekOrder} (bloque "${block.name}") ya se identificó con number ${week.number} en la fila ${week.sourceRowNumber}, pero esta fila trae ${v.weekNumber}.`,
      });
      continue;
    }

    let session = week.sessions.get(v.sessionOrder);
    if (!session) {
      session = {
        order: v.sessionOrder,
        name: v.sessionName,
        dayOfWeek: v.dayOfWeek,
        exercises: [],
        sourceRowNumber: row.rowNumber,
      };
      week.sessions.set(v.sessionOrder, session);
    } else if (
      session.name !== v.sessionName ||
      session.dayOfWeek !== v.dayOfWeek
    ) {
      conflicts.push({
        code: 'SESSION_IDENTITY_CONFLICT',
        field: 'session_name',
        message: `Fila ${row.rowNumber}: la sesión de orden ${v.sessionOrder} (semana ${week.number}) ya se identificó como "${session.name}" (día ${session.dayOfWeek ?? 'sin especificar'}) en la fila ${session.sourceRowNumber}, pero esta fila trae "${v.sessionName}" (día ${v.dayOfWeek ?? 'sin especificar'}).`,
      });
      continue;
    }

    const duplicateExercise = session.exercises.find(
      (exercise) => exercise.order === v.exerciseOrder,
    );
    if (duplicateExercise) {
      conflicts.push({
        code: 'SESSION_EXERCISE_ORDER_CONFLICT',
        field: 'exercise_order',
        message: `Fila ${row.rowNumber}: ya existe un ejercicio con orden ${v.exerciseOrder} en la sesión "${session.name}" (fila ${duplicateExercise.rowNumber}).`,
      });
      continue;
    }

    session.exercises.push({
      rowId: row.rowId,
      rowNumber: row.rowNumber,
      exerciseId: row.exerciseId,
      order: v.exerciseOrder,
      targetSets: v.targetSets,
      targetRepsMin: v.targetRepsMin,
      targetRepsMax: v.targetRepsMax,
      targetRpe: v.targetRpe,
      targetRir: v.targetRir,
      restSeconds: v.restSeconds,
      notes: v.notes,
    });
  }

  if (conflicts.length > 0) {
    return { conflicts };
  }

  const plan: ImportPlanProgram[] = Array.from(programs.values()).map(
    (program) => ({
      name: program.name,
      description: program.description,
      durationWeeks: program.durationWeeks,
      blocks: Array.from(program.blocks.values())
        .sort((a, b) => a.order - b.order)
        .map((block) => ({
          order: block.order,
          name: block.name,
          weeks: Array.from(block.weeks.values())
            .sort((a, b) => a.order - b.order)
            .map((week) => ({
              order: week.order,
              number: week.number,
              sessions: Array.from(week.sessions.values())
                .sort((a, b) => a.order - b.order)
                .map((session) => ({
                  order: session.order,
                  name: session.name,
                  dayOfWeek: session.dayOfWeek,
                  exercises: session.exercises
                    .slice()
                    .sort((a, b) => a.order - b.order),
                })),
            })),
        })),
    }),
  );

  return { plan };
}

// Conteos derivados del plan, usados únicamente para la metadata de
// auditoría (nunca para persistir nada) — evita llevar contadores manuales
// duplicados dentro de la transacción de `ExcelImportsService.confirmBatch`.
export function countImportPlanEntities(plan: ImportPlanProgram[]): {
  programsCreated: number;
  blocksCreated: number;
  weeksCreated: number;
  sessionsCreated: number;
  sessionExercisesCreated: number;
} {
  let blocksCreated = 0;
  let weeksCreated = 0;
  let sessionsCreated = 0;
  let sessionExercisesCreated = 0;

  for (const program of plan) {
    blocksCreated += program.blocks.length;
    for (const block of program.blocks) {
      weeksCreated += block.weeks.length;
      for (const week of block.weeks) {
        sessionsCreated += week.sessions.length;
        for (const session of week.sessions) {
          sessionExercisesCreated += session.exercises.length;
        }
      }
    }
  }

  return {
    programsCreated: plan.length,
    blocksCreated,
    weeksCreated,
    sessionsCreated,
    sessionExercisesCreated,
  };
}
