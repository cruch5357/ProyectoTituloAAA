import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvolutionChart } from './EvolutionChart';
describe('Evolución real', () => {
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
