import { buildExerciseLookup } from './excel-exercise-lookup';

const lookup = buildExerciseLookup([
  { id: 'a', name: 'Press banca' },
  { id: 'b', name: 'Elevación de talones de pie' },
  { id: 'c', name: 'Sentadilla' },
  { id: 'd', name: 'Sentadilla búlgara' },
]);

describe('buildExerciseLookup', () => {
  it('encuentra el ejercicio sin importar mayúsculas', () => {
    expect(lookup('press BANCA')).toEqual({
      found: true,
      id: 'a',
      name: 'Press banca',
    });
  });

  it('acepta el nombre sin tildes ni espacios dobles si es único', () => {
    expect(lookup('Elevacion de  talones de pie')).toMatchObject({
      found: true,
      id: 'b',
    });
  });

  it('sugiere el nombre más parecido cuando no existe', () => {
    expect(lookup('Sentadila')).toEqual({
      found: false,
      suggestion: 'Sentadilla',
    });
    expect(lookup('Press de banca')).toEqual({
      found: false,
      suggestion: 'Press banca',
    });
  });

  it('no sugiere nada cuando no hay uno parecido', () => {
    expect(lookup('Burpee')).toEqual({ found: false });
  });
});
