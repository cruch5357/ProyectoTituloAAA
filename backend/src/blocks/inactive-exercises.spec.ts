import { BadRequestException } from '@nestjs/common';
import { inactiveExerciseNames, LibraryTree } from './library-tree';
import { BlockAssignmentsService } from '../block-assignments/block-assignments.service';
import { PrismaService } from '../prisma/prisma.service';

function block(
  exercises: { name: string; isActive: boolean }[][],
): LibraryTree {
  return {
    id: 'b1',
    name: 'Fuerza',
    weeks: [
      {
        id: 'w1',
        sessions: exercises.map((day, di) => ({
          id: `d${di}`,
          name: `Día ${di + 1}`,
          sessionExercises: day.map((exercise, ei) => ({
            id: `se${di}${ei}`,
            exerciseId: `e-${exercise.name}`,
            exercise,
            programmedSets: [],
          })),
        })),
      },
    ],
  } as unknown as LibraryTree;
}

describe('Bloques con ejercicios desactivados', () => {
  it('lista sin repetir los ejercicios desactivados del bloque', () => {
    expect(
      inactiveExerciseNames(
        block([
          [
            { name: 'Sentadilla', isActive: true },
            { name: 'Remo', isActive: false },
          ],
          [{ name: 'Remo', isActive: false }],
        ]),
      ),
    ).toEqual(['Remo']);
    expect(
      inactiveExerciseNames(block([[{ name: 'Sentadilla', isActive: true }]])),
    ).toEqual([]);
  });

  it('no permite asignar un bloque desactivado', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      block: {
        findFirst: jest
          .fn()
          .mockResolvedValue(block([[{ name: 'Remo', isActive: false }]])),
      },
      program: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (t: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new BlockAssignmentsService(
      prisma as unknown as PrismaService,
    );

    const assign = service.assign('coach-1', 'student-1', {
      blockId: 'b1',
      startDate: '2026-11-02',
      dayOffsets: [1],
    } as never);

    await expect(assign).rejects.toBeInstanceOf(BadRequestException);
    await expect(assign).rejects.toThrow(/ejercicios desactivados \(Remo\)/);
    expect(tx.program.create).not.toHaveBeenCalled();
  });
});
