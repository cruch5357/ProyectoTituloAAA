// Plantilla única de importación de Excel. Fuente de verdad ejecutable de
// qué columnas existen, cuáles son obligatorias y cómo se llaman en español
// (docs/api.md, sección 15, explica el porqué).
//
// Una fila = un ejercicio de un día de entrenamiento. La jerarquía es la
// misma que el editor de Bloques: Bloque -> Semana -> Día -> Ejercicio ->
// series. Al confirmar, cada bloque del archivo se crea en la biblioteca de
// Bloques del coach, listo para editarse y asignarse con "Asignar ciclo".
// Ningún campo representa datos de EJECUCIÓN del alumno: el Excel describe
// solo lo que el coach prescribe.
export type ExcelTemplateColumn =
  | 'block_name'
  | 'week_number'
  | 'day_name'
  | 'exercise_name'
  | 'sets'
  | 'reps'
  | 'weight'
  | 'rpe'
  | 'notes';

// Todas las columnas reconocidas, en el orden de la plantilla. Un encabezado
// que no aparezca acá (ni como alias) se rechaza como "columna desconocida":
// la plantilla es cerrada, igual que `forbidNonWhitelisted` en los DTOs.
export const EXCEL_TEMPLATE_COLUMNS: readonly ExcelTemplateColumn[] = [
  'block_name',
  'week_number',
  'day_name',
  'exercise_name',
  'sets',
  'reps',
  'weight',
  'rpe',
  'notes',
];

// Columnas que deben estar como encabezado. Una celda vacía en estas
// columnas se reporta como error de esa fila (o se completa con la fila de
// arriba en Bloque/Semana/Día, ver excel-fill-down.ts).
export const EXCEL_MANDATORY_COLUMNS: readonly ExcelTemplateColumn[] = [
  'block_name',
  'week_number',
  'day_name',
  'exercise_name',
];

// Encabezado en español: el de la plantilla descargable y el que se usa en
// los mensajes al coach.
export const EXCEL_COLUMN_LABELS: Record<ExcelTemplateColumn, string> = {
  block_name: 'Bloque',
  week_number: 'Semana',
  day_name: 'Día',
  exercise_name: 'Ejercicio',
  sets: 'Series',
  reps: 'Reps',
  weight: 'Carga (kg)',
  rpe: 'RPE',
  notes: 'Notas',
};

// Otros nombres habituales para el mismo encabezado (ya normalizados con
// normalizeHeaderName). Además siempre se acepta el nombre técnico
// (`block_name`) y la etiqueta en español de arriba.
const EXTRA_ALIASES: Partial<Record<ExcelTemplateColumn, string[]>> = {
  block_name: ['nombre_bloque', 'nombre_del_bloque', 'mesociclo'],
  week_number: ['numero_semana', 'n_semana', 'sem'],
  day_name: [
    'dia_de_entrenamiento',
    'nombre_dia',
    'sesion',
    'entrenamiento',
    'nombre_sesion',
  ],
  exercise_name: ['nombre_ejercicio', 'nombre_del_ejercicio'],
  sets: ['n_series', 'sets', 'serie'],
  reps: ['repeticiones', 'rep', 'repes'],
  weight: ['carga', 'peso', 'kg', 'peso_kg', 'carga_kilos', 'kilos'],
  rpe: ['rpe_objetivo'],
  notes: ['nota', 'observaciones', 'indicaciones', 'comentarios'],
};

// Encabezados que solo existían en la plantilla anterior (programa, orden,
// rangos de repeticiones, descanso...). Si aparece alguno se avisa que el
// archivo usa la plantilla vieja, en vez de listar columnas desconocidas.
export const LEGACY_TEMPLATE_HEADERS: ReadonlySet<string> = new Set([
  'programa',
  'program_name',
  'descripcion_del_programa',
  'duracion_semanas',
  'orden_bloque',
  'orden_semana',
  'orden_sesion',
  'orden_ejercicio',
  'reps_min',
  'reps_max',
  'rir',
  'descanso_seg',
]);

// Normaliza un encabezado para compararlo: sin tildes, en minúsculas y con
// cualquier separador (espacios, paréntesis, puntos, guiones, asteriscos)
// convertido en `_`. Ej.: "Carga (kg)" -> "carga_kg", "Día *" -> "dia".
export function normalizeHeaderName(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

// Columna de la plantilla que corresponde a un encabezado del archivo (en
// español, con o sin tildes, o el nombre técnico), o null si no pertenece.
export function resolveTemplateColumn(
  raw: unknown,
): ExcelTemplateColumn | null {
  return COLUMN_BY_ALIAS.get(normalizeHeaderName(raw)) ?? null;
}

export function isLegacyTemplateHeader(raw: unknown): boolean {
  return LEGACY_TEMPLATE_HEADERS.has(normalizeHeaderName(raw));
}

// Letra de columna de Excel (1 -> A, 27 -> AA), para decirle al coach la
// celda exacta que debe corregir.
export function columnLetter(index: number): string {
  let letters = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
