import { cellText, type RawExcelRowValues } from './excel-row-validation';
import type { ExcelTemplateColumn } from './excel-template';

// Bloque, Semana y Día pueden dejarse vacíos para repetir el valor de la
// fila de arriba, como hace un coach al escribir una planificación a mano
// (o al combinar celdas). Cada nivel solo se hereda mientras los niveles
// superiores también sigan iguales: si una fila escribe un bloque distinto
// y deja la semana vacía, la semana NO se toma del bloque anterior (sería
// un error silencioso), queda vacía y se reporta.
//
// Se aplica antes de validar y de guardar las celdas: la vista previa y la
// confirmación ven exactamente los mismos valores.
const LEVELS: readonly ExcelTemplateColumn[] = [
  'block_name',
  'week_number',
  'day_name',
];

export function fillDownHierarchy(
  rows: RawExcelRowValues[],
): RawExcelRowValues[] {
  let previous: RawExcelRowValues | null = null;
  return rows.map((row) => {
    const filled: RawExcelRowValues = { ...row };
    let inherit = previous !== null;
    for (const level of LEVELS) {
      const own = cellText(row[level]);
      if (own) {
        // Un valor escrito distinto corta la herencia de los niveles de abajo.
        if (cellText(previous?.[level]) !== own) inherit = false;
      } else if (inherit && cellText(previous?.[level])) {
        filled[level] = previous?.[level];
      } else {
        inherit = false;
      }
    }
    previous = filled;
    return filled;
  });
}
