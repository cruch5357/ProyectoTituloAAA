import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient } from '../../lib/apiClient';
import { AthleteOverview } from './AthleteOverview';

const training = {
  today: '2026-11-13',
  nextSession: null,
  pendingSession: null,
  assignments: [
    {
      id: 'a1',
      name: 'Progresión flexible',
      status: 'ACTIVE',
      weekCount: 4,
      currentWeek: { weekNumber: 2, weekEnd: '2026-11-15' },
      finishedSessions: 5,
      totalSessions: 12,
      adherence: {
        scheduledSessions: 3,
        completedSessions: 3,
        adherenceRate: 100,
      },
    },
  ],
  sessions: [
    { assignmentId: 'a1', weekNumber: 2, finished: true },
    { assignmentId: 'a1', weekNumber: 2, finished: false },
    { assignmentId: 'a1', weekNumber: 2, finished: false },
    { assignmentId: 'a1', weekNumber: 1, finished: true },
  ],
};

const highlights = {
  enabled: true,
  items: [
    {
      exerciseId: 'bench',
      exerciseName: 'Press banca',
      sessions: 6,
      trend: [
        { date: '2026-11-06', e1rmKg: 66.5 },
        { date: '2026-11-11', e1rmKg: 69.7 },
      ],
      suggestion: {
        available: true,
        suggestedLoadKg: 57.5,
        targetReps: 8,
        lastE1rmKg: 69.7,
        predictedE1rmKg: 72.1,
        expectedChangePct: 3.4,
        lastSession: { date: '2026-11-11', loadKg: 55, reps: 8 },
      },
    },
    {
      exerciseId: 'curl',
      exerciseName: 'Curl',
      sessions: 1,
      trend: [{ date: '2026-11-08', e1rmKg: 16 }],
      suggestion: {
        available: false,
        reason: 'insufficient_history',
        minSessions: 2,
        basedOnSessions: 1,
      },
    },
  ],
};

function mockApi(suggestions: unknown = highlights) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (path) => ({
    data: path.endsWith('/suggested-loads') ? suggestions : training,
    error: null,
    meta: {},
  }));
}

describe('Portada del atleta', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('resume el ciclo activo, la semana y la adherencia', async () => {
    mockApi();
    renderWithProviders(<AthleteOverview studentId="s1" />);
    const summary = await screen.findByRole('region', {
      name: 'Resumen general',
    });
    expect(summary).toHaveTextContent('Progresión flexible');
    expect(summary).toHaveTextContent('5 de 12 sesiones finalizadas');
    expect(summary).toHaveTextContent('2 de 4');
    expect(summary).toHaveTextContent('1 de 3'); // esta semana
    expect(summary).toHaveTextContent('100 %');
  });

  it('muestra la sugerencia del modelo con su tendencia sin elegir ejercicio', async () => {
    mockApi();
    renderWithProviders(<AthleteOverview studentId="s1" />);
    const bench = await screen.findByRole('article', {
      name: 'Carga sugerida de Press banca',
    });
    expect(bench).toHaveTextContent('57,5 kg × 8 reps');
    expect(bench).toHaveTextContent('69,7 → 72,1 kg (+3,4 %)');
    expect(
      within(bench).getByRole('img', { name: /prevé 72,1 kg/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Carga sugerida de Curl' }),
    ).toHaveTextContent('Necesita 2 sesiones para sugerir (tiene 1)');
  });

  it('no muestra el panel del modelo cuando está desactivado', async () => {
    mockApi({ enabled: false, items: [] });
    renderWithProviders(<AthleteOverview studentId="s1" />);
    await screen.findByRole('region', { name: 'Resumen general' });
    expect(
      screen.queryByRole('region', { name: /Próxima sesión/ }),
    ).not.toBeInTheDocument();
  });
});
