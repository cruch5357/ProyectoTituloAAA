import type { EmbeddedExercise } from '../../types/sessionExercise';
import { MUSCLE_GROUPS, findMuscleGroup } from '../../lib/exerciseTaxonomy';
import { MuscleGroupPreview } from './MuscleGroupPicker';

export function ExerciseMuscles({ exercise }: { exercise: Pick<EmbeddedExercise, 'name' | 'muscleGroups'> & { muscleGroup?: string | null } }) {
  // Los registros antiguos pueden tener solo el nombre en español.
  const keys = [...new Set(exercise.muscleGroups?.length
    ? exercise.muscleGroups.filter((key) => findMuscleGroup(key))
    : MUSCLE_GROUPS.filter((group) => group.label.toLocaleLowerCase('es') === exercise.muscleGroup?.toLocaleLowerCase('es')).map((group) => group.key))];
  return <section aria-label={`Zonas trabajadas: ${exercise.name}`}>
    <h3>Zonas trabajadas · {exercise.name}</h3>
    {keys.length ? <MuscleGroupPreview keys={keys} /> : <p className="muted">{exercise.muscleGroup ?? 'Zona muscular no especificada por el coach.'}</p>}
  </section>;
}
