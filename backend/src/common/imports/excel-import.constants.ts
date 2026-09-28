// Límites y constantes del módulo de importación de Excel (PROMPT 13, RF-17/
// RF-18/RF-19 — primera mitad: archivo -> validación -> normalización
// inicial -> vista previa; la confirmación/persistencia definitiva es
// PROMPT 14). Centralizados acá para que el controller (multer) y el
// servicio (validación de contenido) usen siempre los mismos valores, nunca
// números mágicos repetidos — mismo criterio de constantes centralizadas ya
// aplicado en `auth.constants.ts`.

// docs/security.md, sección 23/24: límite de tamaño propuesto de 5 MB,
// aplicado de forma autoritativa en el backend (independiente de cualquier
// límite de UX en el frontend).
export const EXCEL_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Límite de filas de datos (sin contar el encabezado) procesadas por
// importación. No es un requisito explícito de negocio, sino una medida de
// protección de disponibilidad (docs/security.md, sección 25) proporcional
// al MVP: un programa real razonable (ej. 4 bloques x 4 semanas x 5 sesiones
// x 6 ejercicios) ronda ~480 filas, así que 2000 deja margen amplio sin
// permitir un archivo diseñado para agotar memoria/CPU. Si se excede, el
// archivo completo se rechaza (nunca se trunca en silencio: truncar
// escondería filas de la planificación real del coach sin avisar).
export const EXCEL_MAX_DATA_ROWS = 2000;

// Único formato soportado en el MVP (ver informe de cierre de PROMPT 13
// para la justificación completa). `.xlsm` se rechaza explícitamente por
// nombre/extensión Y por contenido (ver excel-file-validation.ts).
export const EXCEL_ALLOWED_EXTENSION = '.xlsx';

// MIME type que los navegadores envían habitualmente para `.xlsx`. Nunca se
// confía en este valor por sí solo (puede ser falsificado por el cliente),
// solo se usa como una señal adicional junto a la extensión y los magic
// bytes reales del contenido.
export const EXCEL_EXPECTED_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Presupuesto de tiempo de procesamiento (parseo + validación de filas) de
// una sola importación. PROMPT 13 permite explícitamente NO introducir una
// arquitectura de workers/procesos hijos para el MVP; este timeout manual
// (chequeado entre filas, ver excel-imports.service.ts) es la mitigación
// mínima equivalente para que un archivo patológico no pueda bloquear el
// event loop indefinidamente — documentado como una desviación consciente
// del ideal descrito en docs/security.md sección 25 (aislamiento en un
// worker), no como un descuido.
export const EXCEL_PROCESSING_TIMEOUT_MS = 10_000;

// Firma binaria ("magic bytes") de un archivo ZIP (todo `.xlsx`/`.xlsm`
// moderno es, por dentro, un contenedor ZIP/OOXML). Cualquier archivo que no
// empiece con esta firma no es un Excel válido, sin importar su extensión o
// Content-Type declarado — nunca se confía solo en lo que dice el cliente.
export const ZIP_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// Un `.xlsm` (macro-habilitado) es, por dentro, el mismo contenedor ZIP que
// un `.xlsx`: no se puede distinguir por magic bytes. La forma liviana de
// detectar uno sin agregar una dependencia completa de parseo de ZIP es
// buscar el nombre de esta entrada interna (siempre presente en cualquier
// OOXML con macros) como substring crudo del buffer — heurística de defensa
// en profundidad para el caso de un `.xlsm` renombrado a `.xlsx` (ver
// informe de cierre de PROMPT 13 para la justificación completa de por qué
// se eligió esta heurística en vez de una librería de ZIP adicional).
export const MACRO_PROJECT_MARKER = Buffer.from('vbaProject.bin', 'utf-8');
