// Definición de LA plantilla única de importación de Excel para el MVP
// (PROMPT 13). Documentada también en `docs/api.md`, sección 15 — este
// archivo es la fuente de verdad ejecutable, la doc explica el porqué.
//
// Alcance deliberado: una fila = una prescripción de UN ejercicio dentro de
// UNA sesión, cubriendo la jerarquía completa Program -> Block -> Week ->
// Session -> Exercise -> Prescripción en esa misma fila (jerarquía "plana",
// repetida en cada fila que comparte programa/bloque/semana/sesión — mismo
// criterio que una hoja de cálculo real usada por un coach, sin pestañas ni
// tablas anidadas). Los campos corresponden EXACTAMENTE a lo que
// `schema.prisma` soporta para Program/Block/Week/Session/SessionExercise:
// ningún campo de este archivo representa un dato de EJECUCIÓN real
// (WorkoutLog/SetLog) — el Excel de este módulo representa únicamente lo
// que el Coach PRESCRIBE.
export type ExcelTemplateColumn =
  | 'program_name'
  | 'program_description'
  | 'duration_weeks'
  | 'block_name'
  | 'block_order'
  | 'week_number'
  | 'week_order'
  | 'session_name'
  | 'day_of_week'
  | 'session_order'
  | 'exercise_name'
  | 'exercise_order'
  | 'target_sets'
  | 'target_reps_min'
  | 'target_reps_max'
  | 'target_rpe'
  | 'target_rir'
  | 'rest_seconds'
  | 'notes';

// Todas las columnas reconocidas por la plantilla, en el orden sugerido de
// referencia (PROMPT 13). Cualquier encabezado del archivo que no aparezca
// acá (normalizado a snake_case en minúsculas) se rechaza como "columna
// desconocida" — mismo espíritu que `forbidNonWhitelisted` en los DTOs
// (auth/main.ts): la plantilla es cerrada, no se aceptan columnas libres.
export const EXCEL_TEMPLATE_COLUMNS: readonly ExcelTemplateColumn[] = [
  'program_name',
  'program_description',
  'duration_weeks',
  'block_name',
  'block_order',
  'week_number',
  'week_order',
  'session_name',
  'day_of_week',
  'session_order',
  'exercise_name',
  'exercise_order',
  'target_sets',
  'target_reps_min',
  'target_reps_max',
  'target_rpe',
  'target_rir',
  'rest_seconds',
  'notes',
];

// Columnas que deben estar presentes SÍ o SÍ como encabezado (aunque una
// celda puntual pueda quedar vacía en alguna fila, lo cual se reporta como
// error de esa fila puntual, no del archivo entero). Son las que identifican
// la fila dentro de la jerarquía Program/Block/Week/Session/Exercise. Las
// columnas de orden (`*_order`) son opcionales: si faltan o están vacías se
// deducen del orden de las filas (ver excel-order-inference.ts).
export const EXCEL_MANDATORY_COLUMNS: readonly ExcelTemplateColumn[] = [
  'program_name',
  'block_name',
  'week_number',
  'session_name',
  'exercise_name',
];

// Nombre en español de cada columna: es el encabezado de la plantilla que se
// descarga desde la app y el que se usa en los mensajes al coach.
export const EXCEL_COLUMN_LABELS: Record<ExcelTemplateColumn, string> = {
  program_name: 'Programa',
  program_description: 'Descripción del programa',
  duration_weeks: 'Duración (semanas)',
  block_name: 'Bloque',
  block_order: 'Orden bloque',
  week_number: 'Semana',
  week_order: 'Orden semana',
  session_name: 'Sesión',
  day_of_week: 'Día',
  session_order: 'Orden sesión',
  exercise_name: 'Ejercicio',
  exercise_order: 'Orden ejercicio',
  target_sets: 'Series',
  target_reps_min: 'Reps mín',
  target_reps_max: 'Reps máx',
  target_rpe: 'RPE',
  target_rir: 'RIR',
  rest_seconds: 'Descanso (seg)',
  notes: 'Notas',
};

// Otros nombres habituales que un coach podría usar como encabezado (ya
// normalizados con normalizeHeaderName). Además de estos, siempre se acepta
// el nombre técnico (`program_name`) y la etiqueta en español de arriba.
const EXTRA_ALIASES: Partial<Record<ExcelTemplateColumn, string[]>> = {
  program_name: ['nombre_programa', 'nombre_del_programa'],
  program_description: ['descripcion'],
  duration_weeks: ['duracion', 'semanas_totales'],
  block_name: ['nombre_bloque', 'mesociclo'],
  week_number: ['numero_semana', 'n_semana'],
  session_name: ['sesion_de_entrenamiento', 'entrenamiento', 'nombre_sesion'],
  day_of_week: ['dia_semana', 'dia_de_la_semana'],
  exercise_name: ['nombre_ejercicio'],
  target_sets: ['sets', 'n_series'],
  target_reps_min: ['repeticiones_min', 'repeticiones_minimas', 'reps_minimas'],
  target_reps_max: ['repeticiones_max', 'repeticiones_maximas', 'reps_maximas'],
  target_rpe: ['rpe_objetivo'],
  target_rir: ['rir_objetivo'],
  rest_seconds: ['descanso', 'descanso_segundos', 'pausa'],
  notes: ['nota', 'observaciones', 'indicaciones', 'comentarios'],
};

// Normaliza un encabezado para compararlo: sin tildes, en minúsculas y con
// cualquier separador (espacios, paréntesis, puntos, guiones) convertido en
// `_`. Ej.: "Reps mín." -> "reps_min", "Descanso (seg)" -> "descanso_seg".
export function normalizeHeaderName(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const COLUMN_BY_ALIAS: ReadonlyMap<string, ExcelTemplateColumn> = new Map(
  EXCEL_TEMPLATE_COLUMNS.flatMap((column) =>
    [
      column,
      normalizeHeaderName(EXCEL_COLUMN_LABELS[column]),
      ...(EXTRA_ALIASES[column] ?? []),
    ].map((alias) => [alias, column] as const),
  ),
);

// Devuelve la columna de la plantilla que corresponde a un encabezado del
// archivo (en español, con o sin tildes, o el nombre técnico), o null si no
// pertenece a la plantilla.
export function resolveTemplateColumn(raw: unknown): ExcelTemplateColumn | null {
  return COLUMN_BY_ALIAS.get(normalizeHeaderName(raw)) ?? null;
}

export function isKnownTemplateColumn(
  header: string,
): header is ExcelTemplateColumn {
  return (EXCEL_TEMPLATE_COLUMNS as readonly string[]).includes(header);
}
