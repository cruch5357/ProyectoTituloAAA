import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PersonalPerformance } from './PersonalPerformance';

describe('Rendimiento personal', () => {
  it('muestra frecuencia y duración con coma decimal', () => {
    render(
      <PersonalPerformance
        summary={{
          totalWorkouts: 16,
          totalSetLogs: 174,
          averageDurationMinutes: 30.75,
          averageOverallRpe: null,
          averageFatigue: null,
          trainingFrequencyPerWeek: 3.2006,
          firstWorkoutAt: '2026-10-05T22:11:00.000Z',
          lastWorkoutAt: '2026-11-09T22:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByText('3,2 sesiones / semana')).toBeInTheDocument();
    expect(screen.getByText('30,8 min')).toBeInTheDocument();
    expect(screen.getAllByText('Sin datos suficientes').length).toBeGreaterThan(0);
  });
});
