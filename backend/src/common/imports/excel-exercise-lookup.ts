import { looseKey } from './excel-import-grouping';
import type { ExerciseLookup } from './excel-row-validation';

export interface CatalogExercise {
  id: string;
  name: string;
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) {
    return (
      0.75 +
      0.25 * (Math.min(a.length, b.length) / Math.max(a.length, b.length))
    );
  }
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

const SUGGESTION_THRESHOLD = 0.6;

// Busca el ejercicio de una fila en el catálogo activo del coach:
// 1. Mismo nombre sin importar mayúsculas.
// 2. Mismo nombre sin importar tildes ni espacios repetidos, si hay un solo
//    ejercicio así (ej. "Elevacion de talones" -> "Elevación de talones").
// 3. Si no se encuentra, sugiere el nombre más parecido para el mensaje de
//    error ("¿Quisiste decir…?"), nunca lo usa sin que el coach lo corrija.
export function buildExerciseLookup(
  exercises: CatalogExercise[],
): (name: string) => ExerciseLookup {
  const exact = new Map<string, CatalogExercise>();
  const loose = new Map<string, CatalogExercise[]>();
  for (const exercise of exercises) {
    exact.set(exercise.name.trim().toLowerCase(), exercise);
    const key = looseKey(exercise.name);
    loose.set(key, [...(loose.get(key) ?? []), exercise]);
  }
  return (name: string) => {
    const byName = exact.get(name.trim().toLowerCase());
    if (byName) return { found: true, id: byName.id, name: byName.name };
    const key = looseKey(name);
    const byLooseName = loose.get(key);
    if (byLooseName?.length === 1) {
      return { found: true, id: byLooseName[0].id, name: byLooseName[0].name };
    }
    let best: { name: string; score: number } | null = null;
    for (const exercise of exercises) {
      const score = similarity(key, looseKey(exercise.name));
      if (score >= SUGGESTION_THRESHOLD && (!best || score > best.score)) {
        best = { name: exercise.name, score };
      }
    }
    return best ? { found: false, suggestion: best.name } : { found: false };
  };
}
