// Catálogos cerrados para clasificar ejercicios. Las claves deben coincidir
// con backend/src/exercises/exercise-taxonomy.ts (el backend valida que solo
// lleguen estas claves).
import abs from '../assets/muscle-groups/abs.webp';
import back from '../assets/muscle-groups/back.webp';
import biceps from '../assets/muscle-groups/biceps.webp';
import calves from '../assets/muscle-groups/calves.webp';
import chest from '../assets/muscle-groups/chest.webp';
import forearms from '../assets/muscle-groups/forearms.webp';
import glutes from '../assets/muscle-groups/glutes.webp';
import hamstrings from '../assets/muscle-groups/hamstrings.webp';
import quadriceps from '../assets/muscle-groups/quadriceps.webp';
import shoulders from '../assets/muscle-groups/shoulders.webp';
import triceps from '../assets/muscle-groups/triceps.webp';

export interface MuscleGroupOption {
  key: string;
  label: string;
  detail: string;
  image: string;
}

export const MUSCLE_GROUPS: readonly MuscleGroupOption[] = [
  { key: 'chest', label: 'Pecho', detail: 'Pectorales', image: chest },
  { key: 'back', label: 'Espalda', detail: 'Dorsales', image: back },
  { key: 'shoulders', label: 'Hombros', detail: 'Deltoides', image: shoulders },
  { key: 'biceps', label: 'Bíceps', detail: 'Bíceps braquial', image: biceps },
  {
    key: 'triceps',
    label: 'Tríceps',
    detail: 'Tríceps braquial',
    image: triceps,
  },
  {
    key: 'forearms',
    label: 'Antebrazos',
    detail: 'Flexores y extensores',
    image: forearms,
  },
  {
    key: 'abs',
    label: 'Abdomen',
    detail: 'Recto abdominal y oblicuos',
    image: abs,
  },
  {
    key: 'quadriceps',
    label: 'Cuádriceps',
    detail: 'Cuádriceps femoral',
    image: quadriceps,
  },
  {
    key: 'hamstrings',
    label: 'Isquiotibiales',
    detail: 'Isquiotibiales',
    image: hamstrings,
  },
  {
    key: 'glutes',
    label: 'Glúteos',
    detail: 'Glúteo mayor y medio',
    image: glutes,
  },
  { key: 'calves', label: 'Pantorrillas', detail: 'Gemelos', image: calves },
];

export const SPORTS: readonly { key: string; label: string }[] = [
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
];

export function findMuscleGroup(key: string): MuscleGroupOption | undefined {
  return MUSCLE_GROUPS.find((group) => group.key === key);
}

export function sportLabel(key: string): string {
  return SPORTS.find((sport) => sport.key === key)?.label ?? key;
}
