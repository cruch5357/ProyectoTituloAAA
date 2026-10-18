import { describe, expect, it } from 'vitest';
import { readableDate } from './readableDate';

describe('fechas legibles', () => {
  const now = new Date('2026-10-17T18:00:00Z');
  it('distingue hoy, ayer y anteayer por día de calendario', () => {
    expect(readableDate('2026-10-17', false, now)).toBe('Hoy');
    expect(readableDate('2026-10-16', false, now)).toBe('Ayer');
    expect(readableDate('2026-10-15', false, now)).toBe('Anteayer');
  });
  it('identifica la semana anterior de lunes a domingo y especifica el día', () => {
    expect(readableDate('2026-10-11', false, now)).toBe('Semana pasada · domingo, 11 de octubre');
    expect(readableDate('2026-10-05', false, now)).toContain('Semana pasada');
    expect(readableDate('2026-10-04', false, now)).toBe('4 de octubre');
    expect(readableDate('2026-10-14', false, now)).toBe('miércoles, 14 de octubre');
  });
  it('incluye el año antiguo y maneja fechas inválidas y futuras', () => {
    expect(readableDate('2025-10-17', false, now)).toBe('17 de octubre de 2025');
    expect(readableDate('2026-10-18', false, now)).toBe('Mañana');
    expect(readableDate('invalid', true, now)).toBe('Fecha no disponible');
  });
  it('omite segundos y compara fechas con la zona de la aplicación', () => {
    const timestamp = '2026-10-18T01:50:05Z';
    const label = readableDate(timestamp, true, new Date(timestamp));
    expect(label).toMatch(/^Hoy · \d{2}:\d{2}$/);
  });
});
