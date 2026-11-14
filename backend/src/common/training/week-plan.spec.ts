import {
  assessTrainingWeek,
  recommendTrainingDates,
  recommendTrainingPlan,
  TrainingWeekSession,
} from './week-plan';

const session = (
  actualDate: string,
  muscleGroups: string[],
  overrides: Partial<TrainingWeekSession> = {},
): TrainingWeekSession => ({
  actualDate,
  muscleGroups,
  status: 'COMPLETED',
  finished: true,
  recordedSets: 5,
  totalSets: 5,
  ...overrides,
});

describe('weekly training assessment', () => {
  it('accepts two future consecutive days without claiming a muscle conflict', () => {
    const result = assessTrainingWeek(
      ['2026-11-10', '2026-11-11', '2026-11-14'],
      3,
    );
    expect(result).toMatchObject({
      level: 'BALANCED',
      code: 'TWO_CONSECUTIVE',
      basis: 'INSUFFICIENT',
      maxConsecutiveDays: 2,
      notifyCoach: false,
    });
  });

  it('treats consecutive registered sessions on different muscles as compatible', () => {
    const actualSessions = [
      session('2026-11-09', ['Piernas']),
      session('2026-11-10', ['Pecho', 'Tríceps']),
    ];
    const result = assessTrainingWeek(
      ['2026-11-09', '2026-11-10', '2026-11-13'],
      3,
      3,
      { actualSessions },
    );
    expect(result).toMatchObject({
      level: 'BALANCED',
      code: 'COMPATIBLE_CONSECUTIVE',
      title: 'Días consecutivos compatibles',
    });
  });

  it('keeps a three-day split routine balanced when recorded muscles alternate', () => {
    const actualSessions = [
      session('2026-11-09', ['Piernas']),
      session('2026-11-10', ['Pecho']),
      session('2026-11-11', ['Espalda']),
    ];
    expect(
      assessTrainingWeek(
        ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-13'],
        4,
        4,
        { actualSessions },
      ),
    ).toMatchObject({
      level: 'BALANCED',
      code: 'COMPATIBLE_CONSECUTIVE',
      title: '3 días consecutivos compatibles',
      notifyCoach: false,
    });
  });

  it('confirms nearby work on the same muscle and uses real effort', () => {
    const actualSessions = [
      session('2026-11-09', ['Piernas'], { averageRpe: 8.5 }),
      session('2026-11-10', ['piernas'], { status: 'PARTIAL' }),
    ];
    const result = assessTrainingWeek(
      actualSessions.map((item) => item.actualDate),
      3,
      2,
      { actualSessions },
    );
    expect(result).toMatchObject({
      level: 'HIGH',
      code: 'CONFIRMED_HIGH_LOAD_CONFLICT',
      basis: 'CONFIRMED',
      affectedMuscleGroups: ['Piernas'],
      notifyCoach: true,
    });
  });

  it('offers a conditional alternative when a pending session may repeat muscles', () => {
    const actualSessions = [session('2026-11-09', ['Piernas'])];
    const result = assessTrainingWeek(['2026-11-09', '2026-11-10'], 2, 2, {
      actualSessions,
      pendingSessions: [
        { name: 'Piernas', muscleGroups: ['Piernas'] },
        { name: 'Espalda', muscleGroups: ['Espalda'] },
      ],
    });
    expect(result).toMatchObject({
      level: 'CAUTION',
      code: 'POTENTIAL_MUSCLE_CONFLICT',
      basis: 'POTENTIAL',
      title: 'Revisa qué sesión realizarás',
      notifyCoach: true,
    });
    expect(result.recommendation).toContain('Espalda');
  });

  it('does not attribute muscular load to a skipped session with no sets', () => {
    const actualSessions = [
      session('2026-11-09', [], {
        status: 'SKIPPED',
        recordedSets: 0,
      }),
      session('2026-11-10', ['Piernas']),
    ];
    const result = assessTrainingWeek(
      ['2026-11-09', '2026-11-10', '2026-11-13'],
      3,
      3,
      { actualSessions },
    );
    expect(result.code).not.toContain('MUSCLE_CONFLICT');
    expect(result.level).toBe('BALANCED');
  });

  it('reports the real completed, partial and skipped breakdown', () => {
    const actualSessions = [
      session('2026-11-09', ['Piernas']),
      session('2026-11-11', ['Espalda'], { status: 'PARTIAL' }),
      session('2026-11-13', [], {
        status: 'SKIPPED',
        recordedSets: 0,
      }),
    ];
    const result = assessTrainingWeek(
      actualSessions.map((item) => item.actualDate),
      3,
      3,
      { actualSessions, weekEnd: '2026-11-15' },
    );
    expect(result).toMatchObject({
      level: 'BALANCED',
      code: 'WEEK_RECORDED',
      title: 'Semana registrada',
    });
    expect(result.message).toContain('1 completada, 1 parcial, 1 omitida');
  });

  it.each([2, 3, 4, 5, 6])(
    'does not classify %i prescribed sessions as high by frequency alone',
    (prescribedSessions) => {
      expect(assessTrainingWeek([], prescribedSessions)).toMatchObject({
        level: 'UNPLANNED',
        code: 'NO_PLAN',
        prescribedSessions,
      });
    },
  );

  it('marks seven organized dates as attention, not high risk', () => {
    const dates = Array.from(
      { length: 7 },
      (_, index) => `2026-11-${String(index + 9).padStart(2, '0')}`,
    );
    expect(assessTrainingWeek(dates, 7)).toMatchObject({
      level: 'CAUTION',
      code: 'SEVEN_DAY_WEEK',
      notifyCoach: true,
    });
  });

  it('keeps three consecutive dates conditional when muscle data is missing', () => {
    expect(
      assessTrainingWeek(['2026-11-10', '2026-11-11', '2026-11-12'], 3),
    ).toMatchObject({
      level: 'CAUTION',
      code: 'CONCENTRATED_DAYS',
      basis: 'INSUFFICIENT',
      notifyCoach: false,
    });
  });

  it('detects a confirmed Sunday/Monday conflict across week boundaries', () => {
    const current = session('2026-11-16', ['Piernas']);
    const previous = session('2026-11-15', ['piernas'], { averageRir: 1 });
    expect(
      assessTrainingWeek(['2026-11-16'], 3, 1, {
        actualSessions: [current],
        adjacentSessions: [previous],
        weekStart: '2026-11-16',
        weekEnd: '2026-11-22',
      }),
    ).toMatchObject({
      level: 'HIGH',
      code: 'CONFIRMED_HIGH_LOAD_CONFLICT',
    });
  });
});

describe('weekly training recommendation', () => {
  it('recommends evenly spaced dates in a partial active week', () => {
    expect(
      recommendTrainingDates('2026-11-10', '2026-11-15', 3, '2026-11-10'),
    ).toEqual(['2026-11-10', '2026-11-12', '2026-11-15']);
  });

  it('excludes real workout dates and spaces only remaining sessions', () => {
    expect(
      recommendTrainingDates('2026-11-09', '2026-11-15', 2, '2026-11-10', [
        '2026-11-10',
      ]),
    ).toEqual(['2026-11-12', '2026-11-15']);
  });

  it('favours recovery from a known Sunday full-body workout', () => {
    const recommendation = recommendTrainingPlan(
      '2026-11-16',
      '2026-11-22',
      2,
      '2026-11-16',
      [],
      {
        adjacentSessions: [
          session('2026-11-15', ['Piernas', 'Pecho', 'Espalda'], {
            averageRpe: 9,
          }),
        ],
        pendingSessions: [
          { muscleGroups: ['Piernas', 'Pecho', 'Espalda'] },
          { muscleGroups: ['Hombros', 'Brazos'] },
        ],
      },
    );
    expect(recommendation.dates).not.toContain('2026-11-16');
    expect(recommendation.reason).toMatch(/músculos|proximidad/);
  });

  it('is honest when every available day is required', () => {
    expect(
      recommendTrainingPlan('2026-11-13', '2026-11-15', 3, '2026-11-13'),
    ).toMatchObject({
      dates: ['2026-11-13', '2026-11-14', '2026-11-15'],
      quality: 'EQUIVALENT',
      reason: expect.stringContaining(
        'No existe una distribución claramente mejor',
      ),
    });
  });

  it('reports when there are not enough dates left', () => {
    expect(
      recommendTrainingPlan('2026-11-14', '2026-11-15', 3, '2026-11-14'),
    ).toMatchObject({
      dates: ['2026-11-14', '2026-11-15'],
      quality: 'LIMITED',
    });
  });

  it('counts real sessions even when legacy data shares one calendar date', () => {
    expect(assessTrainingWeek(['2026-11-10'], 3, 2)).toMatchObject({
      plannedSessions: 2,
      missingSessions: 1,
    });
  });
});
