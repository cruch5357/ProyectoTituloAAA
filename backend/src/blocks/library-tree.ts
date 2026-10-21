import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModifierDto, SaveLibraryBlockDto } from './library.dto';

export const libraryTree = {
  weeks: {
    orderBy: { order: 'asc' as const },
    include: {
      sessions: {
        orderBy: { order: 'asc' as const },
        include: {
          sessionExercises: {
            orderBy: { order: 'asc' as const },
            include: {
              exercise: true,
              programmedSets: { orderBy: { order: 'asc' as const } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BlockInclude;
export type LibraryTree = Prisma.BlockGetPayload<{
  include: typeof libraryTree;
}>;
export function libraryView(block: LibraryTree) {
  return {
    id: block.id,
    name: block.name,
    folderId: block.folderId,
    revision: block.revision,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    weekCount: block.weeks.length,
    weeks: block.weeks.map((w) => ({
      id: w.id,
      days: w.sessions.map((d) => ({
        id: d.id,
        name: d.name,
        exercises: d.sessionExercises.map((e) => ({
          id: e.id,
          exerciseId: e.exerciseId,
          baseName: e.exercise.name,
          modifiers: e.modifiers as unknown as ModifierDto[],
          notes: e.notes ?? '',
          sets: e.programmedSets.map((s) => ({
            id: s.id,
            weight: s.weight === null ? null : Number(s.weight),
            reps: s.reps,
            rpe: s.rpe === null ? null : Number(s.rpe),
            priority: s.priority,
          })),
        })),
      })),
    })),
  };
}
// The position in each ordered array is the only source of persisted order.
// Copies omit every descendant ID so Prisma generates fresh identities.
export function treeCreate(weeks: SaveLibraryBlockDto['weeks'], copy = false) {
  const ids = new Set<string>();
  const identity = (id: string) => {
    if (ids.has(id))
      throw new BadRequestException('IDs repetidos en el bloque');
    ids.add(id);
    return copy ? {} : { id };
  };
  return weeks.map((w, wi) => ({
    ...identity(w.id),
    number: wi + 1,
    order: wi + 1,
    sessions: {
      create: w.days.map((d, di) => {
        if (w.days.length > 7)
          throw new BadRequestException('Máximo 7 días por semana');
        return {
          ...identity(d.id),
          name: d.name,
          order: di + 1,
          sessionExercises: {
            create: d.exercises.map((e, ei) => ({
              ...identity(e.id),
              exerciseId: e.exerciseId,
              order: ei + 1,
              notes: e.notes,
              modifiers: e.modifiers.map((m) => ({
                id: m.id,
                name: m.name,
                category: m.category,
              })),
              targetSets: e.sets.length,
              programmedSets: {
                create: e.sets.map((s, si) => ({
                  ...identity(s.id),
                  order: si + 1,
                  weight: s.weight,
                  reps: s.reps,
                  rpe: s.rpe,
                  priority: s.priority,
                })),
              },
            })),
          },
        };
      }),
    },
  }));
}
