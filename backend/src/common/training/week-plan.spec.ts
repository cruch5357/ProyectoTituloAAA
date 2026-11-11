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
    ).toEqual(['2026-11-10', '2026-11-12', '2026-11-15']);
  });

  it('excludes real workout dates and spaces only the remaining sessions', () => {
    expect(
      recommendTrainingDates('2026-11-09', '2026-11-15', 2, '2026-11-10', [
        '2026-11-10',
      ]),
    ).toEqual(['2026-11-12', '2026-11-15']);
  });

  it('counts real sessions even when legacy data shares one calendar date', () => {
    expect(assessTrainingWeek(['2026-11-10'], 3, 2)).toMatchObject({
      plannedSessions: 2,
      missingSessions: 1,
    });
  });
});
