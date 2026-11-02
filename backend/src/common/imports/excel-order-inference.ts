import type { RawExcelRowValues } from './excel-row-validation';

// Completa las columnas de orden que el coach dejó vacías (o que no incluyó
// en el archivo), deduciéndolas del orden en que aparecen las filas:
//
// - Orden bloque: posición del bloque dentro de su programa (1, 2, ...).
// - Orden semana: posición de la semana dentro de su bloque.
// - Orden sesión: posición de la sesión dentro de su semana.
// - Orden ejercicio: posición del ejercicio dentro de su sesión.
//
// Un valor escrito por el coach nunca se reemplaza. Si mezcla valores
// escritos y vacíos de forma contradictoria, la validación de agrupación
// existente (excel-import-grouping.ts) lo reporta como conflicto.
//
// También traduce el día escrito con palabras ("Lunes", "mié") a su número
// (1 = lunes ... 7 = domingo), que es lo que guarda Session.dayOfWeek.
//
// Se aplica ANTES de validar y de guardar las celdas del batch: así la
// confirmación, que vuelve a validar desde las celdas guardadas, usa
// exactamente los mismos órdenes que vio el coach en la vista previa.

const DAY_NUMBERS: Record<string, number> = {
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
  domingo: 7,
  dom: 7,
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'result' in (value as object)) {
    return cellText((value as { result: unknown }).result);
  }
  return String(value).trim();
}

function key(...parts: unknown[]): string {
  return parts.map((part) => cellText(part).toLowerCase()).join('\u0000');
}

// Asigna 1, 2, 3... a cada identidad distinta dentro de su grupo, según su
// primera aparición.
class AppearanceCounter {
  private readonly positions = new Map<string, Map<string, number>>();

  positionOf(group: string, identity: string): number {
    let inGroup = this.positions.get(group);
    if (!inGroup) {
      inGroup = new Map();
      this.positions.set(group, inGroup);
    }
    let position = inGroup.get(identity);
    if (position === undefined) {
      position = inGroup.size + 1;
      inGroup.set(identity, position);
    }
    return position;
  }
}

export function dayNameToNumber(value: unknown): unknown {
  const text = cellText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
  return DAY_NUMBERS[text] ?? value;
}

export function inferMissingOrders(
  rows: RawExcelRowValues[],
): RawExcelRowValues[] {
  const blocks = new AppearanceCounter();
  const weeks = new AppearanceCounter();
  const sessions = new AppearanceCounter();
  const exercisesPerSession = new Map<string, number>();

  return rows.map((row) => {
    const filled: RawExcelRowValues = { ...row };
    const programKey = key(row.program_name);
    const blockKey = key(row.program_name, row.block_name);
    const weekKey = key(row.program_name, row.block_name, row.week_number);
    const sessionKey = key(
      row.program_name,
      row.block_name,
      row.week_number,
      row.session_name,
    );

    const blockPosition = blocks.positionOf(programKey, blockKey);
    const weekPosition = weeks.positionOf(blockKey, weekKey);
    const sessionPosition = sessions.positionOf(weekKey, sessionKey);
    const exercisePosition = (exercisesPerSession.get(sessionKey) ?? 0) + 1;
    exercisesPerSession.set(sessionKey, exercisePosition);

    if (!cellText(row.block_order)) filled.block_order = blockPosition;
    if (!cellText(row.week_order)) filled.week_order = weekPosition;
    if (!cellText(row.session_order)) filled.session_order = sessionPosition;
    if (!cellText(row.exercise_order)) filled.exercise_order = exercisePosition;
    if (cellText(row.day_of_week)) {
      filled.day_of_week = dayNameToNumber(row.day_of_week);
    }
    return filled;
  });
}
