export interface CatalogItem {
  id: string;
  name: string;
  category: string;
}
export type Priority = "low" | "medium" | "high";
export interface PlannedSet {
  id: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  priority: Priority;
}
export interface PlannedExercise {
  id: string;
  exerciseId: string;
  baseName: string;
  modifiers: CatalogItem[];
  notes: string;
  sets: PlannedSet[];
}
export interface PlannedDay {
  id: string;
  name: string;
  exercises: PlannedExercise[];
}
export interface PlannedWeek {
  id: string;
  days: PlannedDay[];
}
export interface LibraryBlock {
  id: string;
  name: string;
  folderId: string | null;
  revision: number;
  weekCount: number;
  weeks: PlannedWeek[];
}
export interface Folder {
  id: string;
  name: string;
}
export const newId = () => crypto.randomUUID();
export const newSet = (): PlannedSet => ({
  id: newId(),
  weight: null,
  reps: null,
  rpe: null,
  priority: "low",
});
export const displayName = (
  e: Pick<PlannedExercise, "baseName" | "modifiers">,
) => [...e.modifiers.map((m) => m.name), e.baseName].join(" ");
export function move<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length)
    return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
export const copyPrevious = (sets: PlannedSet[], index: number) =>
  sets.map((s, i) =>
    i === index && index > 0 ? { ...sets[index - 1], id: s.id } : s,
  );
export const cloneExercise = (e: PlannedExercise): PlannedExercise => ({
  ...e,
  id: newId(),
  modifiers: e.modifiers.map((m) => ({ ...m })),
  sets: e.sets.map((s) => ({ ...s, id: newId() })),
});
export const cloneDay = (d: PlannedDay): PlannedDay => ({
  ...d,
  id: newId(),
  exercises: d.exercises.map(cloneExercise),
});
export const cloneWeek = (w: PlannedWeek): PlannedWeek => ({
  ...w,
  id: newId(),
  days: w.days.map(cloneDay),
});
export function addDay(week: PlannedWeek, day?: PlannedDay): PlannedWeek {
  if (week.days.length >= 7) return week;
  return {
    ...week,
    days: [
      ...week.days,
      day ?? {
        id: newId(),
        name: `Día ${week.days.length + 1}`,
        exercises: [],
      },
    ],
  };
}
export function savePayload(b: LibraryBlock) {
  return {
    name: b.name.trim(),
    folderId: b.folderId,
    revision: b.revision,
    weeks: b.weeks.map((w) => ({
      ...w,
      days: w.days.map((d) => ({
        ...d,
        name: d.name.trim(),
        exercises: d.exercises.map(({ baseName: _base, ...e }) => e),
      })),
    })),
  };
}
