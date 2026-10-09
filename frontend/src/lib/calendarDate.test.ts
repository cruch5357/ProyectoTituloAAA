import { describe, expect, it } from 'vitest';
import { APP_TIMEZONE, displayDateOnly, displayTimestampDate, todayDate } from './calendarDate';

describe('configured planning dates', () => {
  it('uses the environment timezone for today and timestamp display', () => {
    const instant = new Date('2026-10-08T01:00:00Z');
    const expected = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
    expect(todayDate(instant)).toBe(expected);
    expect(displayTimestampDate(instant.toISOString())).toBe(instant.toLocaleDateString('es-CL', { timeZone: APP_TIMEZONE }));
  });
  it('does not shift calendar dates across timezone boundaries', () => {
    expect(displayDateOnly('2026-09-06')).toBe(new Date('2026-09-06T12:00:00Z').toLocaleDateString('es-CL', { timeZone: 'UTC' }));
    expect(displayDateOnly('2026-09-06T00:00:00.000Z')).toBe(displayDateOnly('2026-09-06'));
  });
});
