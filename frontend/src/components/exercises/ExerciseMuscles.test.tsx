import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '../../lib/exerciseTaxonomy';
import { ExerciseMuscles } from './ExerciseMuscles';

describe('visuales musculares del alumno', () => {
  it.each(MUSCLE_GROUPS)('comparte la imagen del coach para $label', (group) => {
    render(<ExerciseMuscles exercise={{ name: 'Ejercicio', muscleGroups: [group.key] }} />);
    expect(screen.getByRole('img', { name: `Zona muscular: ${group.label}` })).toHaveAttribute('src', group.image);
  });
  it('cambia los grupos al cambiar de ejercicio y conserva múltiples zonas', () => {
    const { rerender } = render(<ExerciseMuscles exercise={{ name: 'Primero', muscleGroups: ['chest', 'triceps'] }} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    rerender(<ExerciseMuscles exercise={{ name: 'Segundo', muscleGroups: ['hamstrings'] }} />);
    expect(screen.queryByAltText('Zona muscular: Pecho')).not.toBeInTheDocument();
    expect(screen.getByAltText('Zona muscular: Isquiotibiales')).toBeInTheDocument();
  });
});
