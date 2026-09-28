import {
  sanitizeOriginalFilename,
  validateExcelFile,
} from './excel-file-validation';
import { EXCEL_MAX_FILE_SIZE_BYTES } from './excel-import.constants';

const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function buildValidXlsxBuffer(): Buffer {
  // No hace falta un .xlsx real para probar la validación de CONTENEDOR:
  // alcanza con que empiece con la firma ZIP y no contenga el marcador de
  // macros — el parseo real de la estructura interna lo prueba
  // excel-imports.service.spec.ts con un archivo generado por exceljs.
  return Buffer.concat([ZIP_HEADER, Buffer.from('contenido-zip-simulado')]);
}

describe('validateExcelFile', () => {
  it('acepta un archivo .xlsx con firma ZIP válida y sin marcador de macros', () => {
    const errors = validateExcelFile({
      originalName: 'plan.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buildValidXlsxBuffer().length,
      buffer: buildValidXlsxBuffer(),
    });
    expect(errors).toEqual([]);
  });

  it('rechaza un archivo vacío', () => {
    const errors = validateExcelFile({
      originalName: 'plan.xlsx',
      mimetype: undefined,
      size: 0,
      buffer: Buffer.alloc(0),
    });
    expect(errors).toEqual([
      { code: 'EMPTY_FILE', message: expect.any(String) },
    ]);
  });

  it('rechaza un archivo que excede el tamaño máximo', () => {
    const buffer = buildValidXlsxBuffer();
    const errors = validateExcelFile({
      originalName: 'plan.xlsx',
      mimetype: undefined,
      size: EXCEL_MAX_FILE_SIZE_BYTES + 1,
      buffer,
    });
    expect(errors.some((error) => error.code === 'FILE_TOO_LARGE')).toBe(true);
  });

  it('rechaza explícitamente la extensión .xlsm', () => {
    const buffer = buildValidXlsxBuffer();
    const errors = validateExcelFile({
      originalName: 'plan.xlsm',
      mimetype: undefined,
      size: buffer.length,
      buffer,
    });
    expect(
      errors.some((error) => error.code === 'MACRO_EXTENSION_REJECTED'),
    ).toBe(true);
  });

  it('rechaza cualquier extensión distinta de .xlsx', () => {
    const buffer = buildValidXlsxBuffer();
    const errors = validateExcelFile({
      originalName: 'plan.csv',
      mimetype: undefined,
      size: buffer.length,
      buffer,
    });
    expect(errors.some((error) => error.code === 'INVALID_EXTENSION')).toBe(
      true,
    );
  });

  it('rechaza un archivo con extensión .xlsx falsificada (contenido no-ZIP)', () => {
    const buffer = Buffer.from('esto no es un excel, es texto plano');
    const errors = validateExcelFile({
      originalName: 'plan.xlsx',
      mimetype: undefined,
      size: buffer.length,
      buffer,
    });
    expect(errors.some((error) => error.code === 'INVALID_FILE_CONTENT')).toBe(
      true,
    );
  });

  it('detecta un .xlsm renombrado a .xlsx por el marcador interno de macros', () => {
    const buffer = Buffer.concat([
      ZIP_HEADER,
      Buffer.from('xl/vbaProject.bin y más contenido zip'),
    ]);
    const errors = validateExcelFile({
      originalName: 'plan.xlsx',
      mimetype: undefined,
      size: buffer.length,
      buffer,
    });
    expect(
      errors.some((error) => error.code === 'MACRO_CONTENT_DETECTED'),
    ).toBe(true);
  });

  it('señala un Content-Type inesperado cuando sí viene informado', () => {
    const buffer = buildValidXlsxBuffer();
    const errors = validateExcelFile({
      originalName: 'plan.xlsx',
      mimetype: 'application/octet-stream',
      size: buffer.length,
      buffer,
    });
    expect(errors.some((error) => error.code === 'UNEXPECTED_MIME_TYPE')).toBe(
      true,
    );
  });

  it('acumula todos los errores detectables en una sola pasada', () => {
    const buffer = Buffer.from('no es zip');
    const errors = validateExcelFile({
      originalName: 'plan.xlsm',
      mimetype: 'text/plain',
      size: EXCEL_MAX_FILE_SIZE_BYTES + 1,
      buffer,
    });
    const codes = errors.map((error) => error.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'FILE_TOO_LARGE',
        'MACRO_EXTENSION_REJECTED',
        'UNEXPECTED_MIME_TYPE',
        'INVALID_FILE_CONTENT',
      ]),
    );
  });
});

describe('sanitizeOriginalFilename', () => {
  it('descarta cualquier componente de ruta', () => {
    expect(sanitizeOriginalFilename('C:/malicioso/../plan.xlsx')).toBe(
      'plan.xlsx',
    );
    expect(sanitizeOriginalFilename('/etc/passwd')).toBe('passwd');
  });

  it('reemplaza caracteres fuera del conjunto seguro', () => {
    const sanitized = sanitizeOriginalFilename('plan<>:"|?*.xlsx');
    expect(sanitized).toMatch(/^plan_+\.xlsx$/);
    expect(sanitized).not.toMatch(/[<>:"|?*]/);
  });

  it('nunca devuelve un nombre vacío', () => {
    expect(sanitizeOriginalFilename('')).toBe('archivo.xlsx');
    expect(sanitizeOriginalFilename('///')).toBe('archivo.xlsx');
  });

  it('acota la longitud máxima', () => {
    const longName = 'a'.repeat(500) + '.xlsx';
    expect(sanitizeOriginalFilename(longName).length).toBeLessThanOrEqual(160);
  });
});
