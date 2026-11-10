import { computeAdherence } from './adherence';
import { dateOnly, effectiveSessionDate } from './calendar-date';

describe('adherence', () => {
  const start = dateOnly('2026-10-01');
  const today = '2026-10-09';
  const session = (
    sessionId: string,
    date: string | null,
    completed = false,
    weekIndex?: number,
  ) => ({ sessionId, date, completed, weekIndex });
  it('returns null for zero due sessions', () => {
    expect(computeAdherence(start, [], today).adherenceRate).toBeNull();
  });
  it('computes 8 / 10 = 80%', () => {
    expect(
      computeAdherence(
        start,
        Array.from({ length: 10 }, (_, i) =>
          session(`${i}`, '2026-10-01', i < 8, 0),
        ),
        today,
      ),
    ).toEqual({
      scheduledSessions: 10,
      completedSessions: 8,
      adherenceRate: 80,
    });
  });
  it('excludes the active week and undated sessions even when completed', () => {
    expect(
      computeAdherence(
        start,
        [session('s', '2026-10-06', true, 1), session('n', null, true)],
        today,
      ).adherenceRate,
    ).toBeNull();
  });
  it('does not penalize an in-progress workout while its week remains active', () => {
    expect(
      computeAdherence(start, [session('s', '2026-10-06', false, 1)], today)
        .adherenceRate,
    ).toBeNull();
  });
  it('counts an unfinished workout after its prescribed week closes', () => {
    expect(
      computeAdherence(start, [session('s', '2026-10-01', false, 0)], today)
        .adherenceRate,
    ).toBe(0);
  });
  it('counts a session once even with multiple logs', () => {
    expect(
      computeAdherence(
        start,
        [
          session('s', '2026-10-01', true, 0),
          session('s', '2026-10-01', true, 0),
        ],
        today,
      ),
    ).toEqual({
      scheduledSessions: 1,
      completedSessions: 1,
      adherenceRate: 100,
    });
  });
  it.each([
    ['2026-10-10', 0, 1],
    ['2026-10-02', 1, 0],
  ])(
    'keeps week %s eligibility independent from override %s',
    (override, weekIndex, count) => {
      const date = effectiveSessionDate(start, 0, 4, {
        scheduledDate: dateOnly(override),
      });
      expect(
        computeAdherence(start, [session('s', date, false, weekIndex)], today)
          .scheduledSessions,
      ).toBe(count);
    },
  );
  it('uses Sunday as a compatibility fallback when only a date is known', () => {
    expect(
      computeAdherence(
        start,
        [session('closed', '2026-10-04'), session('active', '2026-10-05')],
        today,
      ).scheduledSessions,
    ).toBe(1);
  });
  it('does not close adherence until the Monday after the prescribed week', () => {
    const sessions = [session('s', '2026-10-01', false, 0)];
    expect(computeAdherence(start, sessions, '2026-10-04')).toMatchObject({
      scheduledSessions: 0,
      adherenceRate: null,
    });
    expect(computeAdherence(start, sessions, '2026-10-05')).toMatchObject({
      scheduledSessions: 1,
      adherenceRate: 0,
    });
  });
  it('supports the overview one-based global week number during migration', () => {
    expect(
      computeAdherence(
        start,
        [
          {
            ...session('s', '2026-10-10'),
            weekIndex: undefined,
            weekNumber: 1,
          },
        ],
        today,
      ).scheduledSessions,
    ).toBe(1);
  });
  it('returns null for assignment without startDate', () => {
    expect(
      computeAdherence(null, [session('s', today, true, 0)], today)
        .adherenceRate,
    ).toBeNull();
  });
  it('does not attribute ambiguous legacy history to a new cycle', () => {
    expect(
      computeAdherence(
        start,
        [
          {
            ...session('s', '2026-10-01', false, 0),
            historyAmbiguous: true,
          },
        ],
        today,
      ),
    ).toMatchObject({
      adherenceRate: null,
      insufficientReason: 'legacy-history',
    });
    expect(
      computeAdherence(
        start,
        [
          {
            ...session('s', '2026-10-01', true, 0),
            historyAmbiguous: true,
          },
        ],
        today,
      ).adherenceRate,
    ).toBe(100);
  });
});
