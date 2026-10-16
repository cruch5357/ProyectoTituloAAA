import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient } from '../../lib/apiClient';
import { SuggestedLoadCard } from './SuggestedLoadCard';
import type { SuggestedLoad } from '../../types/dashboard';

function mockResponse(data: SuggestedLoad) {
  return vi
    .spyOn(apiClient, 'get')
    .mockResolvedValue({ data, error: null, meta: {} });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('SuggestedLoadCard', () => {
  it('muestra la carga sugerida y su explicación', async () => {
    const spy = mockResponse({
      available: true,
      suggestedLoadKg: 62.5,
      targetReps: 8,
      lastE1rmKg: 78,
      predictedE1rmKg: 79.6,
      expectedChangePct: 2.1,
      basedOnSessions: 5,
      lastSession: { date: '2026-10-10', loadKg: 60, reps: 8 },
      modelVersion: 'v1',
    });

    renderWithProviders(
      <SuggestedLoadCard studentId="student-1" exerciseId="exercise-1" />,
    );

    expect(await screen.findByText('62,5 kg')).toBeInTheDocument();
    expect(
      screen.getByText(/Última sesión: 60 kg × 8 \(10\/10\/2026\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/\+2,1%/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(
      '/dashboard/students/student-1/exercises/exercise-1/suggested-load',
    );
  });

  it('explica cuando falta historial', async () => {
    mockResponse({
      available: false,
      reason: 'insufficient_history',
      minSessions: 2,
      basedOnSessions: 1,
    });

    renderWithProviders(
      <SuggestedLoadCard studentId="student-1" exerciseId="exercise-1" />,
    );

    expect(
      await screen.findByText(/Se necesitan al menos 2 sesiones/),
    ).toBeInTheDocument();
    expect(screen.getByText(/\(hay 1\)/)).toBeInTheDocument();
  });

  it('no muestra nada si la función está desactivada', async () => {
    const spy = mockResponse({ available: false, reason: 'disabled' });

    const { container } = renderWithProviders(
      <SuggestedLoadCard studentId="student-1" exerciseId="exercise-1" />,
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
