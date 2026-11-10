import { assessTrainingWeek, recommendTrainingDates } from './week-plan';

describe('weekly training plan', () => {
  it('accepts two consecutive days and recommends rest afterwards', () => {
    const result = assessTrainingWeek(
      ['2026-11-10', '2026-11-11', '2026-11-14'],
      3,
    );
    expect(result).toMatchObject({
      level: 'BALANCED',
      code: 'TWO_CONSECUTIVE',
      maxConsecutiveDays: 2,
    });
  });

  it('warns from three consecutive days', () => {
    const result = assessTrainingWeek(
      ['2026-11-10', '2026-11-11', '2026-11-12'],
      3,
    );
    expect(result).toMatchObject({
      level: 'CAUTION',
      code: 'THREE_CONSECUTIVE',
      maxConsecutiveDays: 3,
    });
  });

  it('flags a prescription of five sessions for coach review', () => {
    expect(assessTrainingWeek([], 5)).toMatchObject({
      level: 'HIGH',
      code: 'HIGH_FREQUENCY',
      prescribedSessions: 5,
    });
  });

  it('recommends evenly spaced dates in a partial active week', () => {
    expect(
      recommendTrainingDates('2026-11-10', '2026-11-15', 3, '2026-11-10'),
    ).toEqual(['2026-11-10', '2026-11-12', '2026-11-14']);
  });

  it('reports the average complete rest days between recent workouts', () => {
    expect(
      assessTrainingWeek(['2026-11-10'], 1, [
        '2026-11-01',
        '2026-11-03',
        '2026-11-06',
      ]).historicalAverageRestDays,
    ).toBe(1.5);
  });
});
