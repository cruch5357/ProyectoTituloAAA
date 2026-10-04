import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvolutionChart } from './EvolutionChart';
describe('Evolución real', () => {
  it('reutiliza la línea temporal para RPE con escala fija y conserva el cero medido', () => {
    render(
      <EvolutionChart
        effortPoints={[
          { performedAt: '2026-10-01', overallRpe: 0 },
          { performedAt: '2026-10-03', overallRpe: 8 },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', { name: /Esfuerzo por fecha/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Esfuerzo percibido (RPE 0–10) · últimos 15 días'),
    ).toBeInTheDocument();
  });
  it('no fabrica puntos cuando falta carga', () => {
    render(
      <EvolutionChart
        points={[
          {
            workoutLogId: '1',
            performedAt: '2026-01-01',
            maxActualLoad: null,
            totalActualReps: 4,
            setCount: 1,
          },
        ]}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByText('Más registros, más perspectiva'),
    ).toBeInTheDocument();
  });
  it('muestra cargas cero y positivas con descripción accesible', () => {
    render(
      <EvolutionChart
        points={[0, 25].map((load, index) => ({
          workoutLogId: String(index),
          performedAt: `2026-01-0${index + 1}`,
          maxActualLoad: load,
          totalActualReps: 4,
          setCount: 1,
        }))}
      />,
    );
    expect(
      screen.getByRole('img', { name: /Evolución de carga máxima/ }),
    ).toBeInTheDocument();
  });
});
