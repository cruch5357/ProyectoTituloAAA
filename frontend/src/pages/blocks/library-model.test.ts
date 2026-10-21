import { describe, expect, it } from "vitest";
import {
  addDay,
  cloneWeek,
  copyPrevious,
  displayName,
  move,
  newSet,
  savePayload,
  type LibraryBlock,
} from "./library-model";
describe("Biblioteca: operaciones de programación", () => {
  const exercise = {
    id: "e",
    exerciseId: "catalog",
    baseName: "Squat",
    modifiers: [{ id: "m", name: "Low Bar", category: "Variante" }],
    notes: "Control",
    sets: [{ ...newSet(), weight: 100, reps: 5, rpe: 7 }, newSet()],
  };
  const week = {
    id: "w",
    days: [{ id: "d", name: "Día 1", exercises: [exercise] }],
  };
  it("rechaza el octavo día incluso por duplicación", () => {
    let w = week;
    for (let i = 0; i < 20; i++) w = addDay(w);
    expect(w.days).toHaveLength(7);
    expect(addDay(w, week.days[0])).toBe(w);
  });
  it("duplica todos los descendientes sin compartir estado", () => {
    const clone = cloneWeek(week);
    expect(clone.id).not.toBe(week.id);
    expect(clone.days[0].id).not.toBe("d");
    expect(clone.days[0].exercises[0].id).not.toBe("e");
    expect(clone.days[0].exercises[0].sets[0].id).not.toBe(exercise.sets[0].id);
    clone.days[0].exercises[0].sets[0].weight = 120;
    clone.days[0].exercises[0].modifiers[0].name = "Other";
    expect(exercise.sets[0].weight).toBe(100);
    expect(exercise.modifiers[0].name).toBe("Low Bar");
  });
  it("copia valores y prioridad sin copiar identidad y conserva primera serie", () => {
    const sets = copyPrevious(exercise.sets, 1);
    expect(sets[1]).toEqual({ ...sets[0], id: exercise.sets[1].id });
    expect(copyPrevious(sets, 0)).toEqual(sets);
  });
  it("persiste orden, notas, opcionales y modificadores estructurados", () => {
    const block: LibraryBlock = {
      id: "b",
      name: " Bloque ",
      folderId: null,
      revision: 0,
      weekCount: 1,
      weeks: [week],
    };
    const payload = savePayload(block);
    expect(payload.name).toBe("Bloque");
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    expect(displayName(exercise)).toBe("Low Bar Squat");
    expect(move(exercise.sets, 1, 0)[0].id).toBe(exercise.sets[1].id);
    expect(move(exercise.sets, -1, 0)).toBe(exercise.sets);
  });
});
