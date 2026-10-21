import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  SessionExercise,
  Exercise,
  ProgrammedSet,
} from '@prisma/client';
import { PerformedSetDto } from './block-assignment.dto';

export type ExerciseWithSets = SessionExercise & {
  exercise: Exercise;
  programmedSets: ProgrammedSet[];
};
export type FrozenExercise = {
  name: string;
  muscleGroups: string[];
  muscleGroup: string | null;
  videoUrl: string | null;
  instructions: string | null;
};
export function exerciseSnapshot(e: Exercise): FrozenExercise {
  return {
    name: e.name,
    muscleGroups: e.muscleGroups.length
      ? e.muscleGroups
      : e.muscleGroup
        ? [e.muscleGroup]
        : [],
    muscleGroup: e.muscleGroup,
    videoUrl: e.videoUrl,
    instructions: e.instructions,
  };
}
export function exerciseInfo(e: ExerciseWithSets): FrozenExercise {
  return e.frozenExercise
    ? (e.frozenExercise as unknown as FrozenExercise)
    : exerciseSnapshot(e.exercise);
}
export function plannedSets(e: ExerciseWithSets) {
  return e.programmedSets.length
    ? e.programmedSets.map((s) => ({
        setNumber: s.order,
        weight: s.weight === null ? null : Number(s.weight),
        reps: s.reps,
        rpe: s.rpe === null ? null : Number(s.rpe),
        priority: s.priority,
      }))
    : Array.from({ length: e.targetSets ?? 0 }, (_, i) => ({
        setNumber: i + 1,
        weight: null,
        reps: e.targetRepsMin === e.targetRepsMax ? e.targetRepsMin : null,
        rpe: e.targetRpe === null ? null : Number(e.targetRpe),
        priority: 'low' as const,
      }));
}
export function trainingStatus(
  total: number,
  recorded: number,
  decided: number,
  finished = false,
) {
  if (!decided && !finished) return 'NOT_STARTED' as const;
  if (!recorded) return 'SKIPPED' as const;
  return total > 0 && recorded === total
    ? ('COMPLETED' as const)
    : ('PARTIAL' as const);
}
export const setKey = (e: string, n: number) => `${e}:${n}`;
export function validatePerformed(
  exercises: ExerciseWithSets[],
  sets: PerformedSetDto[],
) {
  const allowed = new Set(
    exercises.flatMap((e) =>
      plannedSets(e).map((s) => setKey(e.id, s.setNumber)),
    ),
  );
  const used = new Set<string>();
  for (const set of sets) {
    const key = setKey(set.sessionExerciseId, set.setNumber);
    if (!allowed.has(key))
      throw new BadRequestException(
        'Solo puedes registrar las series prescritas por tu coach',
      );
    if (used.has(key)) throw new BadRequestException('Serie repetida');
    used.add(key);
  }
  return allowed.size;
}
export const trainingSessionInclude = {
  week: { include: { block: { include: { program: true } } } },
  sessionExercises: {
    orderBy: { order: 'asc' as const },
    include: {
      exercise: true,
      programmedSets: { orderBy: { order: 'asc' as const } },
    },
  },
} satisfies Prisma.SessionInclude;
