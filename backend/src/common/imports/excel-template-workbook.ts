import * as ExcelJS from 'exceljs';
import {
  EXCEL_COLUMN_LABELS,
  EXCEL_MANDATORY_COLUMNS,
  ExcelTemplateColumn,
} from './excel-template';

// Plantilla descargable desde "Importar Excel". La PRIMERA hoja es la que se
// importa (ExcelImportsService lee `worksheets[0]`), así que siempre va
// primero "Planificación"; "Instrucciones" y "Mis ejercicios" son de apoyo.
//
// Las columnas de orden no se incluyen: el sistema las deduce del orden de
// las filas (excel-order-inference.ts). Quien las necesite puede agregarlas.

const TEMPLATE_COLUMNS: readonly ExcelTemplateColumn[] = [
  'program_name',
  'program_description',
  'duration_weeks',
  'block_name',
  'week_number',
  'session_name',
  'day_of_week',
  'exercise_name',
  'target_sets',
  'target_reps_min',
  'target_reps_max',
  'target_rpe',
  'target_rir',
  'rest_seconds',
  'notes',
];

const COLUMN_HELP: Record<ExcelTemplateColumn, [string, string]> = {
  program_name: [
    'Nombre del programa. Se repite en todas sus filas.',
    'Fuerza principiante',
  ],
  program_description: [
    'Descripción breve del programa (opcional).',
    'Adaptación general',
  ],
  duration_weeks: ['Duración total del programa en semanas (opcional).', '4'],
  block_name: [
    'Nombre del bloque o mesociclo dentro del programa.',
    'Adaptación',
  ],
  block_order: [
    'Posición del bloque. Si se omite, se usa el orden de las filas.',
    '1',
  ],
  week_number: ['Número de la semana dentro del bloque.', '1'],
  week_order: [
    'Posición de la semana. Si se omite, se usa el orden de las filas.',
    '1',
  ],
  session_name: ['Nombre de la sesión o día de entrenamiento.', 'Día A'],
  day_of_week: [
    'Día de la semana (opcional): Lunes a Domingo, o 1 a 7.',
    'Lunes',
  ],
  session_order: [
    'Posición de la sesión. Si se omite, se usa el orden de las filas.',
    '1',
  ],
  exercise_name: [
    'Nombre EXACTO de un ejercicio activo de tu catálogo (ver hoja "Mis ejercicios").',
    'Sentadilla',
  ],
  exercise_order: [
    'Posición del ejercicio. Si se omite, se usa el orden de las filas.',
    '1',
  ],
  target_sets: ['Series (opcional).', '3'],
  target_reps_min: ['Repeticiones mínimas (opcional).', '8'],
  target_reps_max: [
    'Repeticiones máximas (opcional, mayor o igual a las mínimas).',
    '10',
  ],
  target_rpe: ['RPE objetivo, de 0 a 10 (opcional).', '7'],
  target_rir: ['RIR objetivo, repeticiones en reserva (opcional).', '2'],
  rest_seconds: ['Descanso entre series en segundos (opcional).', '90'],
  notes: [
    'Indicaciones para el alumno (opcional, máximo 500 caracteres).',
    'Controlar la bajada',
  ],
};

const FALLBACK_EXERCISES = [
  'Sentadilla',
  'Press banca',
  'Remo con barra',
  'Peso muerto',
];

function exampleRows(
  exerciseNames: string[],
): Array<Partial<Record<ExcelTemplateColumn, string | number>>> {
  // Solo ejercicios del catálogo del coach, para que el ejemplo sea
  // importable tal cual. Los nombres genéricos se usan únicamente si el
  // catálogo está vacío (la hoja "Mis ejercicios" lo advierte).
  const names = (
    exerciseNames.length > 0 ? exerciseNames : FALLBACK_EXERCISES
  ).slice(0, 4);
  const half = Math.ceil(names.length / 2);
  const dayB = names.length > 1 ? names.slice(half) : names;
  const sessions: Array<[string, string, string[]]> = [
    ['Día A', 'Lunes', names.slice(0, half)],
    ['Día B', 'Jueves', dayB],
  ];
  const rows: Array<Partial<Record<ExcelTemplateColumn, string | number>>> = [];
  for (const [session, day, exercises] of sessions) {
    for (const exercise of exercises) {
      rows.push({
        program_name: 'Fuerza principiante',
        program_description:
          rows.length === 0
            ? 'Programa de ejemplo: reemplázalo por el tuyo'
            : '',
        duration_weeks: 4,
        block_name: 'Adaptación',
        week_number: 1,
        session_name: session,
        day_of_week: day,
        exercise_name: exercise,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 10,
        target_rpe: 7,
        rest_seconds: 90,
      });
    }
  }
  return rows;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF087D8F' },
};

export async function buildTemplateWorkbook(
  exerciseNames: string[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Plataforma de Entrenamiento';

  const plan = workbook.addWorksheet('Planificación', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  plan.columns = TEMPLATE_COLUMNS.map((column) => ({
    header: EXCEL_COLUMN_LABELS[column],
    key: column,
    width: Math.max(12, EXCEL_COLUMN_LABELS[column].length + 4),
  }));
  plan.getColumn('exercise_name').width = 24;
  plan.getColumn('program_description').width = 30;
  plan.getColumn('notes').width = 28;
  const header = plan.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;
  for (const row of exampleRows(exerciseNames)) plan.addRow(row);

  const help = workbook.addWorksheet('Instrucciones');
  help.columns = [
    { header: 'Columna', key: 'column', width: 22 },
    { header: '¿Obligatoria?', key: 'mandatory', width: 14 },
    { header: 'Qué escribir', key: 'description', width: 70 },
    { header: 'Ejemplo', key: 'example', width: 22 },
  ];
  help.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  help.getRow(1).fill = HEADER_FILL;
  const allColumns = Object.keys(COLUMN_HELP) as ExcelTemplateColumn[];
  for (const column of allColumns) {
    help.addRow({
      column: EXCEL_COLUMN_LABELS[column],
      mandatory: EXCEL_MANDATORY_COLUMNS.includes(column) ? 'Sí' : 'No',
      description: COLUMN_HELP[column][0],
      example: COLUMN_HELP[column][1],
    });
  }
  help.addRow({});
  for (const line of [
    'Cada fila es UN ejercicio dentro de UNA sesión. Repite programa, bloque, semana y sesión en cada fila.',
    'Solo se importa la hoja "Planificación" (la primera). Puedes borrar las filas de ejemplo.',
    'El orden de bloques, semanas, sesiones y ejercicios es el orden en que aparecen las filas.',
    'Los ejercicios deben existir en tu catálogo con el mismo nombre (sin importar mayúsculas).',
    'Antes de guardar, la app muestra una vista previa con los errores de cada fila.',
  ]) {
    help.addRow({ column: line });
  }

  const catalog = workbook.addWorksheet('Mis ejercicios');
  catalog.columns = [
    { header: 'Ejercicios activos de tu catálogo', key: 'name', width: 40 },
  ];
  catalog.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  catalog.getRow(1).fill = HEADER_FILL;
  if (exerciseNames.length === 0) {
    catalog.addRow({
      name: 'Todavía no tienes ejercicios: créalos en "Ejercicios" antes de importar.',
    });
  }
  for (const name of exerciseNames) catalog.addRow({ name });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
