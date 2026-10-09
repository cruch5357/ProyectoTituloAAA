import { dateOnly, sessionDate, todayDate } from './calendar-date';
describe('Calendario: fechas reales', () => {
  const previousTimezone = process.env.APP_TIMEZONE;
  beforeEach(() => {
    delete process.env.APP_TIMEZONE;
  });
  afterEach(() => {
    if (previousTimezone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previousTimezone;
  });
  it('honors the configured timezone at a day boundary', () => {
    process.env.APP_TIMEZONE = 'UTC';
    expect(todayDate(new Date('2026-10-08T01:00:00Z'))).toBe('2026-10-08');
  });
  it('rechaza fechas imposibles, horas y formatos ambiguos', () => {
    for (const value of ['2026-02-30', '07/10/2026', '2026-10-07T00:00:00Z'])
      expect(() => dateOnly(value)).toThrow();
  });
  it('no inventa fechas para asignaciones históricas ni sesiones sin día', () => {
    expect(sessionDate(null, 0, 1)).toBeNull();
    expect(sessionDate(dateOnly('2026-10-07'), 0, null)).toBeNull();
  });
  it('ordena semanas continuas entre bloques y mantiene el día de semana', () => {
    expect(sessionDate(dateOnly('2026-10-07'), 0, 3)).toBe('2026-10-07');
    expect(sessionDate(dateOnly('2026-10-07'), 0, 1)).toBe('2026-10-12');
    expect(sessionDate(dateOnly('2026-10-07'), 2, 1)).toBe('2026-10-26');
  });
  it('no desplaza fechas por DST y resuelve hoy en Santiago', () => {
    expect(sessionDate(dateOnly('2026-09-01'), 1, 1)).toBe('2026-09-14');
    expect(todayDate(new Date('2026-10-08T01:00:00Z'))).toBe('2026-10-07');
    expect(sessionDate(dateOnly('2028-02-28'), 0, 2)).toBe('2028-02-29');
  });
});
