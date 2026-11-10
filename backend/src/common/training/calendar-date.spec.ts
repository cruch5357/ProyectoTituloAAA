import {
  assignmentWeekBounds,
  assignmentWeekIndex,
  assignmentWeekState,
  dateOnly,
  sessionDate,
  todayDate,
} from './calendar-date';
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
  it('ordena semanas calendario continuas y mantiene el día sugerido', () => {
    expect(sessionDate(dateOnly('2026-10-07'), 0, 3)).toBe('2026-10-07');
    expect(sessionDate(dateOnly('2026-10-07'), 0, 1)).toBe('2026-10-07');
    expect(sessionDate(dateOnly('2026-10-07'), 2, 1)).toBe('2026-10-19');
  });
  it('no desplaza fechas por DST y resuelve hoy en Santiago', () => {
    expect(sessionDate(dateOnly('2026-09-01'), 1, 1)).toBe('2026-09-07');
    expect(todayDate(new Date('2026-10-08T01:00:00Z'))).toBe('2026-10-07');
    expect(sessionDate(dateOnly('2028-02-28'), 0, 2)).toBe('2028-02-29');
  });
  it('recorta la primera semana al inicio real y luego usa lunes a domingo', () => {
    const start = dateOnly('2026-08-26');
    expect(assignmentWeekBounds(start, 0)).toEqual({
      weekStart: '2026-08-24',
      availableFrom: '2026-08-26',
      weekEnd: '2026-08-30',
    });
    expect(assignmentWeekBounds(start, 1)).toEqual({
      weekStart: '2026-08-31',
      availableFrom: '2026-08-31',
      weekEnd: '2026-09-06',
    });
    expect(assignmentWeekBounds(start, 11)).toEqual({
      weekStart: '2026-11-09',
      availableFrom: '2026-11-09',
      weekEnd: '2026-11-15',
    });
  });
  it('resuelve el índice por semana calendario y no por bloques móviles de siete días', () => {
    const start = dateOnly('2026-08-26');
    expect(assignmentWeekIndex(start, '2026-08-25')).toBe(-1);
    expect(assignmentWeekIndex(start, '2026-08-26')).toBe(0);
    expect(assignmentWeekIndex(start, '2026-08-30')).toBe(0);
    expect(assignmentWeekIndex(start, '2026-08-31')).toBe(1);
    expect(assignmentWeekIndex(start, '2026-11-09')).toBe(11);
  });
  it('clasifica futuro, activo y vencido únicamente por los límites semanales', () => {
    const start = dateOnly('2026-08-26');
    expect(assignmentWeekState(start, 0, '2026-08-25')).toBe('FUTURE');
    expect(assignmentWeekState(start, 0, '2026-08-26')).toBe('ACTIVE');
    expect(assignmentWeekState(start, 0, '2026-08-30')).toBe('ACTIVE');
    expect(assignmentWeekState(start, 0, '2026-08-31')).toBe('EXPIRED');
    expect(assignmentWeekState(start, 1, '2026-08-30')).toBe('FUTURE');
    expect(assignmentWeekState(start, 1, '2026-08-31')).toBe('ACTIVE');
  });
  it('rechaza índices inválidos y conserva asignaciones sin fecha', () => {
    expect(assignmentWeekBounds(null, 0)).toBeNull();
    expect(assignmentWeekBounds(dateOnly('2026-08-26'), -1)).toBeNull();
    expect(assignmentWeekBounds(dateOnly('2026-08-26'), 0.5)).toBeNull();
    expect(assignmentWeekIndex(null, '2026-08-26')).toBe(-1);
    expect(assignmentWeekState(null, 0, '2026-08-26')).toBeNull();
  });
});
