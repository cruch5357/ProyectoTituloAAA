import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExerciseDto } from './create-exercise.dto';
import { UpdateExerciseDto } from './update-exercise.dto';
import { ListExercisesQueryDto } from './list-exercises-query.dto';

describe('DTOs de ejercicio - grupos musculares y deportes', () => {
  it('acepta claves válidas del catálogo', async () => {
    const dto = Object.assign(new CreateExerciseDto(), {
      name: 'Press banca',
      muscleGroups: ['chest', 'triceps', 'shoulders'],
      sports: ['powerlifting', 'bodybuilding'],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    [{ muscleGroups: ['piernas'] }, 'muscleGroups'],
    [{ muscleGroups: ['chest', 'chest'] }, 'muscleGroups'],
    [{ muscleGroups: 'chest' }, 'muscleGroups'],
    [{ sports: ['golf'] }, 'sports'],
  ])(
    'rechaza valores fuera del catálogo o repetidos: %j',
    async (body, field) => {
      const errors = await validate(
        Object.assign(new UpdateExerciseDto(), body),
      );
      expect(errors.map((e) => e.property)).toContain(field);
    },
  );

  it('valida los filtros del listado', async () => {
    const ok = plainToInstance(ListExercisesQueryDto, {
      muscleGroup: 'glutes',
      sport: 'running',
    });
    expect(await validate(ok)).toHaveLength(0);

    const bad = plainToInstance(ListExercisesQueryDto, { sport: 'golf' });
    expect((await validate(bad)).map((e) => e.property)).toContain('sport');
  });
});
