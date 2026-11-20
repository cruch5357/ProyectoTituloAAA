import * as ExcelJS from 'exceljs';
import {
  columnLetter,
  EXCEL_COLUMN_LABELS,
  EXCEL_MANDATORY_COLUMNS,
  EXCEL_TEMPLATE_COLUMNS,
  ExcelTemplateColumn,
} from './excel-template';
import { MAX_SETS_PER_ROW, MAX_WEEK_NUMBER } from './excel-row-validation';

// Plantilla descargable desde "Importar Excel". La hoja "Planificación" es
// la que se importa; "Instrucciones" y "Mis ejercicios" son de apoyo.
//
// Pensada para que el coach no tenga que leer nada para empezar:
// - Encabezados obligatorios en color oscuro y opcionales en claro, con una
//   nota al pasar el mouse que explica qué escribir.
// - La columna Ejercicio es una lista desplegable con su catálogo, así que
//   el nombre siempre coincide.
// - Semana, Series, Reps, Carga y RPE avisan al escribir un valor inválido.
// - Una fila de ejemplo con uno de sus ejercicios, importable tal cual.

export const PLAN_SHEET_NAME = 'Planificación';
export const CATALOG_SHEET_NAME = 'Mis ejercicios';
// Filas con listas y validaciones preparadas (el límite real es
// EXCEL_MAX_DATA_ROWS; más allá de esto se puede escribir igual).
const PREPARED_ROWS = 600;

const COLUMN_HELP: Record<ExcelTemplateColumn, [string, string]> = {
  block_name: [
    'Nombre del bloque. Escríbelo EXACTAMENTE igual en todas sus filas (mismas tildes y mayúsculas). Puedes dejarlo vacío para repetir el de la fila de arriba.',
    'Fuerza base',
  ],
  week_number: [
    'Número de semana dentro del bloque: 1, 2, 3… Deben ir seguidas desde la 1. Vacío = misma semana de la fila de arriba.',
    '1',
  ],
  day_name: [
    'Nombre del día de entrenamiento (máximo 7 por semana). Escríbelo igual en todas sus filas. Vacío = mismo día de la fila de arriba.',
    'Día A',
  ],
  exercise_name: [
    'Elige el ejercicio de la lista (son los de tu catálogo). Si no está, créalo en la app en "Ejercicios" y vuelve a descargar la plantilla.',
    'Sentadilla',
  ],
  sets: [
    'Cuántas series iguales (con las mismas reps, carga y RPE). Vacío = 1 serie.',
    '3',
  ],
  reps: ['Repeticiones de cada serie (un solo número).', '8'],
  weight: ['Carga de cada serie en kilos. Puedes usar coma: 62,5.', '60'],
  rpe: ['Esfuerzo percibido de 0 a 10 (opcional).', '7'],
  notes: ['Indicaciones para el alumno (opcional).', 'Bajar en 3 segundos'],
};

type ExampleRow = Partial<Record<ExcelTemplateColumn, string | number>>;

// Una sola fila de ejemplo, con un ejercicio del catálogo del coach para que
// se pueda importar tal cual (el genérico solo se usa con catálogo vacío).
function exampleRow(exerciseNames: string[]): ExampleRow {
  return {
    block_name: 'Fuerza base',
    week_number: 1,
    day_name: 'Día A',
    exercise_name: exerciseNames[0] ?? 'Sentadilla',
    sets: 3,
    reps: 8,
    weight: 60,
    rpe: 7,
    notes: 'Bajar en 3 segundos',
  };
}

const DARK = 'FF0B5F6B';
const LIGHT = 'FFB8E1E6';
const fill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});
const thin: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: 'FF8AA9AE' } },
};

function styleHeader(row: ExcelJS.Row, mandatory: (col: number) => boolean) {
  row.height = 22;
  row.eachCell((cell, col) => {
    const required = mandatory(col);
    cell.fill = fill(required ? DARK : LIGHT);
    cell.font = {
      bold: true,
      color: { argb: required ? 'FFFFFFFF' : 'FF0F2E33' },
    };
    cell.alignment = { vertical: 'middle' };
    cell.border = thin;
  });
}

const WIDTHS: Record<ExcelTemplateColumn, number> = {
  block_name: 20,
  week_number: 9,
  day_name: 16,
  exercise_name: 30,
  sets: 9,
  reps: 9,
  weight: 12,
  rpe: 8,
  notes: 36,
};

function numberRule(
  type: 'whole' | 'decimal',
  min: number,
  max: number,
  message: string,
): ExcelJS.DataValidation {
  return {
    type,
    operator: 'between',
    allowBlank: true,
    formulae: [min, max],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Valor no válido',
    error: message,
  };
}

export async function buildTemplateWorkbook(
  exerciseNames: string[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Plataforma de Entrenamiento';

  // --- Planificación -----------------------------------------------------
  const plan = workbook.addWorksheet(PLAN_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: DARK } },
  });
  plan.columns = EXCEL_TEMPLATE_COLUMNS.map((column) => ({
    header: EXCEL_COLUMN_LABELS[column],
    key: column,
    width: WIDTHS[column],
  }));
  styleHeader(plan.getRow(1), (col) =>
    EXCEL_MANDATORY_COLUMNS.includes(EXCEL_TEMPLATE_COLUMNS[col - 1]),
  );
  EXCEL_TEMPLATE_COLUMNS.forEach((column, index) => {
    const required = EXCEL_MANDATORY_COLUMNS.includes(column);
    plan.getRow(1).getCell(index + 1).note =
      `${required ? 'Obligatoria. ' : 'Opcional. '}${COLUMN_HELP[column][0]}`;
  });
  plan.addRow(exampleRow(exerciseNames));

  const letter = (column: ExcelTemplateColumn) =>
    columnLetter(EXCEL_TEMPLATE_COLUMNS.indexOf(column) + 1);
  const rules: Array<[ExcelTemplateColumn, ExcelJS.DataValidation]> = [
    [
      'week_number',
      numberRule(
        'whole',
        1,
        MAX_WEEK_NUMBER,
        `La semana debe ser un número entero de 1 a ${MAX_WEEK_NUMBER}.`,
      ),
    ],
    [
      'sets',
      numberRule(
        'whole',
        1,
        MAX_SETS_PER_ROW,
        `Las series deben ser un número entero de 1 a ${MAX_SETS_PER_ROW}.`,
      ),
    ],
    [
      'reps',
      numberRule(
        'whole',
        0,
        10000,
        'Escribe un solo número de repeticiones (por ejemplo 8).',
      ),
    ],
    [
      'weight',
      numberRule(
        'decimal',
        0,
        9999.99,
        'La carga debe ser un número en kilos (por ejemplo 62,5).',
      ),
    ],
    [
      'rpe',
      numberRule('decimal', 0, 10, 'El RPE debe ser un número de 0 a 10.'),
    ],
  ];
  if (exerciseNames.length > 0) {
    rules.push([
      'exercise_name',
      {
        type: 'list',
        allowBlank: true,
        formulae: [
          `'${CATALOG_SHEET_NAME}'!$A$2:$A$${exerciseNames.length + 1}`,
        ],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Ejercicio no encontrado',
        error:
          'Elige un ejercicio de la lista. Si no está, créalo en la app en "Ejercicios" y descarga otra vez la plantilla.',
      },
    ]);
  }
  for (let row = 2; row <= PREPARED_ROWS; row += 1) {
    for (const [column, rule] of rules) {
      plan.getCell(`${letter(column)}${row}`).dataValidation = rule;
    }
  }

  // --- Instrucciones -----------------------------------------------------
  const help = workbook.addWorksheet('Instrucciones', {
    properties: { tabColor: { argb: 'FFE0A800' } },
  });
  help.columns = [
    { key: 'a', width: 22 },
    { key: 'b', width: 14 },
    { key: 'c', width: 80 },
    { key: 'd', width: 20 },
  ];
  const title = help.addRow({ a: 'Cómo completar la planificación' });
  title.font = { bold: true, size: 14 };
  const steps = [
    '1. Escribe en la hoja "Planificación". Cada fila es UN ejercicio de un día de entrenamiento.',
    '2. Bloque, Semana, Día y Ejercicio son obligatorios (encabezado oscuro). El resto es opcional.',
    '3. Elige el ejercicio de la lista desplegable: son los de tu catálogo (hoja "Mis ejercicios").',
    '4. "Series" crea varias series iguales. Para series distintas (pirámides), usa una fila por serie del mismo ejercicio, una debajo de otra.',
    '5. Sube el archivo en "Importar Excel". Si algo está mal, la app te dice la fila y la celda exacta (por ejemplo D5).',
    '6. Al confirmar, cada bloque queda en "Bloques", listo para revisarlo y asignarlo con "Asignar ciclo".',
  ];
  for (const step of steps) help.addRow({ a: step });
  help.addRow({});
  const rule = help.addRow({
    a: 'IMPORTANTE: escribe el nombre de cada bloque y de cada día EXACTAMENTE igual en todas sus filas (mismas tildes, mayúsculas y espacios). Si "Fuerza base" aparece también como "fuerza base", el Excel no se puede importar.',
  });
  rule.font = { bold: true, color: { argb: 'FFB42318' } };
  help.addRow({
    a: 'Atajo: puedes dejar Bloque, Semana y Día vacíos para repetir el valor de la fila de arriba.',
  });
  help.addRow({});
  const header = help.addRow({
    a: 'Columna',
    b: '¿Obligatoria?',
    c: 'Qué escribir',
    d: 'Ejemplo',
  });
  styleHeader(header, () => true);
  for (const column of EXCEL_TEMPLATE_COLUMNS) {
    const row = help.addRow({
      a: EXCEL_COLUMN_LABELS[column],
      b: EXCEL_MANDATORY_COLUMNS.includes(column) ? 'Sí' : 'No',
      c: COLUMN_HELP[column][0],
      d: COLUMN_HELP[column][1],
    });
    row.getCell('c').alignment = { wrapText: true, vertical: 'top' };
  }

  // --- Mis ejercicios ----------------------------------------------------
  const catalog = workbook.addWorksheet(CATALOG_SHEET_NAME);
  catalog.columns = [
    { header: 'Ejercicios de tu catálogo', key: 'name', width: 40 },
  ];
  styleHeader(catalog.getRow(1), () => true);
  for (const name of exerciseNames) catalog.addRow({ name });
  if (exerciseNames.length === 0) {
    catalog.addRow({
      name: 'Todavía no tienes ejercicios: créalos en "Ejercicios" antes de importar.',
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
