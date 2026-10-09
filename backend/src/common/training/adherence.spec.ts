import { computeAdherence } from './adherence';
import { dateOnly, effectiveSessionDate } from './calendar-date';

describe('adherence', () => {
  const start = dateOnly('2026-10-01');
  const today = '2026-10-09';
  const session = (
    sessionId: string,
    date: string | null,
    completed = false,
  ) => ({ sessionId, date, completed });
  it('returns null for zero due sessions', () => {
    expect(computeAdherence(start, [], today).adherenceRate).toBeNull();
  });
  it('computes 8 / 10 = 80%', () => {
    expect(
      computeAdherence(
        start,
        Array.from({ length: 10 }, (_, i) => session(`${i}`, today, i < 8)),
        today,
      ),
    ).toEqual({
      scheduledSessions: 10,
      completedSessions: 8,
      adherenceRate: 80,
    });
  });
  it('excludes future and undated sessions even when completed', () => {
    expect(
      computeAdherence(
        start,
        [session('s', '2026-10-10', true), session('n', null, true)],
        today,
      ).adherenceRate,
    ).toBeNull();
  });
  it('does not count an in-progress workout', () => {
    expect(
      computeAdherence(start, [session('s', today)], today).adherenceRate,
    ).toBe(0);
  });
  it('counts a session once even with multiple logs', () => {
    expect(
      computeAdherence(
        start,
        [session('s', today, true), session('s', today, true)],
        today,
      ),
    ).toEqual({
      scheduledSessions: 1,
      completedSessions: 1,
      adherenceRate: 100,
    });
  });
  it.each([
    ['2026-10-10', 0],
    ['2026-10-09', 1],
  ])('uses override %s (due count %s)', (override, count) => {
    const date = effectiveSessionDate(start, 0, 4, {
      scheduledDate: dateOnly(override),
    });
    expect(
      computeAdherence(start, [session('s', date)], today).scheduledSessions,
    ).toBe(count);
  });
  it('returns null for assignment without startDate', () => {
    expect(
      computeAdherence(null, [session('s', today, true)], today).adherenceRate,
    ).toBeNull();
  });
  it('does not attribute ambiguous legacy history to a new cycle', () => {
    expect(
      computeAdherence(
        start,
        [{ ...session('s', today), historyAmbiguous: true }],
        today,
      ),
    ).toMatchObject({
      adherenceRate: null,
      insufficientReason: 'legacy-history',
    });
    expect(
      computeAdherence(
        start,
        [{ ...session('s', today, true), historyAmbiguous: true }],
        today,
      ).adherenceRate,
    ).toBe(100);
  });
});
