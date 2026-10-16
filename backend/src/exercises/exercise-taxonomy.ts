// Catalogos cerrados para clasificar ejercicios. Se guardan las claves (no
// las etiquetas) en Exercise.muscleGroups / Exercise.sports, de modo que
// renombrar una etiqueta no obliga a migrar datos. El frontend mantiene la
// misma lista con sus imagenes en frontend/src/lib/exerciseTaxonomy.ts:
// cualquier cambio aqui debe replicarse alla.
export const MUSCLE_GROUPS = [
  { key: 'chest', label: 'Pecho' },
  { key: 'back', label: 'Espalda' },
  { key: 'shoulders', label: 'Hombros' },
  { key: 'biceps', label: 'Bíceps' },
  { key: 'triceps', label: 'Tríceps' },
  { key: 'forearms', label: 'Antebrazos' },
  { key: 'abs', label: 'Abdomen' },
  { key: 'quadriceps', label: 'Cuádriceps' },
  { key: 'hamstrings', label: 'Isquiotibiales' },
  { key: 'glutes', label: 'Glúteos' },
  { key: 'calves', label: 'Pantorrillas' },
] as const;

export const SPORTS = [
  { key: 'general', label: 'Acondicionamiento general' },
  { key: 'bodybuilding', label: 'Hipertrofia / Fisicoculturismo' },
  { key: 'powerlifting', label: 'Powerlifting' },
  { key: 'weightlifting', label: 'Halterofilia' },
  { key: 'crossfit', label: 'CrossFit' },
  { key: 'running', label: 'Running' },
  { key: 'cycling', label: 'Ciclismo' },
  { key: 'swimming', label: 'Natación' },
  { key: 'football', label: 'Fútbol' },
  { key: 'basketball', label: 'Básquetbol' },
  { key: 'tennis', label: 'Tenis' },
  { key: 'martial_arts', label: 'Artes marciales' },
] as const;

export const MUSCLE_GROUP_KEYS: string[] = MUSCLE_GROUPS.map((g) => g.key);
export const SPORT_KEYS: string[] = SPORTS.map((s) => s.key);

// Texto legible que se sigue guardando en Exercise.muscleGroup para las
// pantallas que muestran el grupo muscular como texto (sesiones, registros,
// tablero de programa). Respeta el orden en que el coach eligio los grupos.
export function muscleGroupLabels(keys: string[]): string | null {
  const labels = keys
    .map((key) => MUSCLE_GROUPS.find((g) => g.key === key)?.label)
    .filter((label): label is (typeof MUSCLE_GROUPS)[number]['label'] =>
      Boolean(label),
    );
  return labels.length > 0 ? labels.join(', ') : null;
}
