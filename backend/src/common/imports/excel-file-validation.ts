// Validación de ARCHIVO (no de contenido/filas) para la importación de
// Excel (PROMPT 13, docs/security.md secciones 23-25). Funciones puras y
// reutilizables, mismo criterio que `common/training/workout-metrics.ts`:
// no dependen de Prisma ni de Express, reciben datos ya extraídos
// (buffer/nombre/tamaño/mimetype) y devuelven un resultado estructurado, sin
// lanzar excepciones — el llamador decide cómo responder al cliente.
//
// Principio de seguridad (docs/security.md sección 23): la extensión que
// declara el nombre de archivo, y el Content-Type que declara el cliente,
// son SIEMPRE datos no confiables. La única verdad es el contenido real del
// buffer (magic bytes + heurística de macros). Ambas señales declaradas se
// siguen validando (rechazar temprano lo obviamente inválido), pero nunca
// reemplazan la validación de contenido.
import { basename } from 'path';
import {
  EXCEL_ALLOWED_EXTENSION,
  EXCEL_EXPECTED_MIME_TYPE,
  EXCEL_MAX_FILE_SIZE_BYTES,
  MACRO_PROJECT_MARKER,
  ZIP_MAGIC_BYTES,
} from './excel-import.constants';

export interface FileValidationError {
  code: string;
  message: string;
}

export interface FileValidationInput {
  originalName: string;
  mimetype: string | undefined;
  size: number;
  buffer: Buffer;
}

// Devuelve la lista de errores encontrados (vacía = archivo válido a nivel
// de contenedor). Se acumulan TODOS los problemas detectables en vez de
// cortar en el primero, para que el coach vea de una vez qué está mal — el
// mismo criterio de "reportar todo lo posible en una sola pasada" que pide
// PROMPT 13 para la vista previa de filas.
export function validateExcelFile(
  input: FileValidationInput,
): FileValidationError[] {
  const errors: FileValidationError[] = [];

  if (input.size <= 0) {
    errors.push({ code: 'EMPTY_FILE', message: 'El archivo está vacío.' });
    // Sin contenido no tiene sentido seguir validando magic bytes/macros.
    return errors;
  }

  if (input.size > EXCEL_MAX_FILE_SIZE_BYTES) {
    errors.push({
      code: 'FILE_TOO_LARGE',
      message: `El archivo supera el tamaño máximo permitido (${Math.floor(
        EXCEL_MAX_FILE_SIZE_BYTES / (1024 * 1024),
      )} MB).`,
    });
  }

  const lowerName = input.originalName.toLowerCase();
  const hasXlsmExtension = lowerName.endsWith('.xlsm');
  const hasXlsxExtension = lowerName.endsWith(EXCEL_ALLOWED_EXTENSION);

  if (hasXlsmExtension) {
    errors.push({
      code: 'MACRO_EXTENSION_REJECTED',
      message:
        'No se aceptan archivos .xlsm (con macros). Solo se admite .xlsx.',
    });
  } else if (!hasXlsxExtension) {
    errors.push({
      code: 'INVALID_EXTENSION',
      message: 'El archivo debe tener extensión .xlsx.',
    });
  }

  // Señal adicional, nunca autoritativa por sí sola (un cliente puede
  // enviar cualquier Content-Type). Solo se rechaza cuando SÍ viene
  // informado y es claramente distinto — nunca se exige que esté presente.
  if (input.mimetype && input.mimetype !== EXCEL_EXPECTED_MIME_TYPE) {
    errors.push({
      code: 'UNEXPECTED_MIME_TYPE',
      message: 'El tipo de archivo declarado no corresponde a un .xlsx.',
    });
  }

  const startsWithZipSignature = input.buffer
    .subarray(0, ZIP_MAGIC_BYTES.length)
    .equals(ZIP_MAGIC_BYTES);

  if (!startsWithZipSignature) {
    errors.push({
      code: 'INVALID_FILE_CONTENT',
      message:
        'El contenido del archivo no corresponde a un Excel (.xlsx) válido.',
    });
    // Si el contenedor ni siquiera es un ZIP, buscar el marcador de macros
    // adentro no aporta nada más.
    return errors;
  }

  // Heurística de defensa en profundidad: un .xlsm renombrado a .xlsx sigue
  // siendo, por dentro, un ZIP con la entrada `xl/vbaProject.bin`. No se usa
  // ninguna librería de parseo de ZIP para esto (ver informe de cierre de
  // PROMPT 13): una búsqueda de substring binario sobre el buffer completo
  // es suficiente para este propósito puntual y evita una dependencia
  // nueva.
  if (input.buffer.includes(MACRO_PROJECT_MARKER)) {
    errors.push({
      code: 'MACRO_CONTENT_DETECTED',
      message:
        'El archivo contiene macros (VBA), aunque su extensión sea .xlsx. No se acepta contenido con macros.',
    });
  }

  return errors;
}

// Nombre sanitizado para guardar como METADATA (`ExcelImportBatch.
// originalFilename`) — nunca se usa para construir una ruta de archivo (el
// archivo nunca se escribe a disco: se procesa en memoria y se descarta, ver
// excel-imports.service.ts y el comentario de `ExcelImportBatch` en
// schema.prisma, que no tiene ninguna columna de ruta de almacenamiento).
// Aun así se sanitiza antes de guardarlo: se descarta cualquier componente
// de ruta (`path.basename`), se eliminan caracteres de control y cualquier
// carácter fuera de un conjunto seguro, y se acota la longitud — el nombre
// de archivo lo elige el cliente, así que nunca se confía en él tal cual
// para nada, ni siquiera para mostrarlo de vuelta.
const SAFE_FILENAME_CHARS = /[^a-zA-Z0-9 ._\-()]/g;
const MAX_STORED_FILENAME_LENGTH = 160;

export function sanitizeOriginalFilename(rawName: string): string {
  const base = basename(rawName || '');
  const sanitized = base
    .replace(SAFE_FILENAME_CHARS, '_')
    .trim()
    .slice(0, MAX_STORED_FILENAME_LENGTH);
  return sanitized.length > 0 ? sanitized : 'archivo.xlsx';
}
