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
// error de esa fila puntual, no del archivo entero). Son las que hacen
// falta para poder ubicar la fila dentro de la jerarquía
// Program/Block/Week/Session/Exercise sin ambigüedad. Las columnas fuera de
// esta lista (descripciones, valores de prescripción) pueden omitirse por
// completo del archivo si el coach no las necesita.
export const EXCEL_MANDATORY_COLUMNS: readonly ExcelTemplateColumn[] = [
  'program_name',
  'block_name',
  'block_order',
  'week_number',
  'week_order',
  'session_name',
  'session_order',
  'exercise_name',
  'exercise_order',
];

export function normalizeHeaderName(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function isKnownTemplateColumn(
  header: string,
): header is ExcelTemplateColumn {
  return (EXCEL_TEMPLATE_COLUMNS as readonly string[]).includes(header);
}
