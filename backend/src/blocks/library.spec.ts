import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLibraryBlockDto, SaveLibraryBlockDto } from './library.dto';
import { treeCreate } from './library-tree';
const data = () => ({
  name: 'Fuerza',
  revision: 0,
  folderId: null,
  weeks: [
    {
      id: 'w',
      days: [
        {
          id: 'd',
          name: 'Día 1',
          exercises: [
            {
              id: 'e',
              exerciseId: 'catalog',
              modifiers: [{ id: 'm', name: 'Low Bar', category: 'Variante' }],
              notes: 'Control',
              sets: [
                {
                  id: 's',
                  weight: 100,
                  reps: 5,
                  rpe: 7,
                  priority: 'low' as const,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
describe('Biblioteca: validación y duplicación', () => {
  it('crea semanas con carpeta opcional y rechaza nombres vacíos', async () => {
    expect(
      await validate(
        plainToInstance(CreateLibraryBlockDto, {
          name: ' Fuerza ',
          weekCount: 6,
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateLibraryBlockDto, { name: '   ', weekCount: 0 }),
      ),
    ).toHaveLength(2);
  });
  it('valida árbol, opcionales, RPE y límite de días en servidor', async () => {
    const dto = data();
    expect(
      await validate(plainToInstance(SaveLibraryBlockDto, dto)),
    ).toHaveLength(0);
    dto.weeks[0].days[0].exercises[0].sets[0].rpe = 11;
    expect(
      (await validate(plainToInstance(SaveLibraryBlockDto, dto))).length,
    ).toBeGreaterThan(0);
    dto.weeks[0].days = Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`,
      name: 'Día',
      exercises: [],
    }));
    expect(
      (await validate(plainToInstance(SaveLibraryBlockDto, dto))).length,
    ).toBeGreaterThan(0);
    expect(() => treeCreate(dto.weeks)).toThrow('Máximo 7');
  });
  it('copia sin IDs y genera orden desde las posiciones', () => {
    const source = data();
    const copy = treeCreate(source.weeks, true);
    expect(copy[0].id).toBeUndefined();
    expect(copy[0].sessions.create[0].id).toBeUndefined();
    expect(
      copy[0].sessions.create[0].sessionExercises.create[0].id,
    ).toBeUndefined();
    expect(
      copy[0].sessions.create[0].sessionExercises.create[0].programmedSets
        .create[0].id,
    ).toBeUndefined();
    expect(
      copy[0].sessions.create[0].sessionExercises.create[0].programmedSets
        .create[0].order,
    ).toBe(1);
    // Catalog modifier identities are references; only tree entity IDs regenerate.
  });
  it('rechaza IDs repetidos en cualquier nivel', () => {
    const dto = data();
    dto.weeks[0].days[0].id = 'w';
    expect(() => treeCreate(dto.weeks)).toThrow('IDs repetidos');
  });
});
