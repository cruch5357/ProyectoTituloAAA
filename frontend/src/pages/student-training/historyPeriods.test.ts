import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "../../types/workoutLog";
import {
  formatWorkoutHistoryPeriod,
  groupWorkoutLogsByPeriod,
  workoutHistoryPeriodBounds,
} from "./historyPeriods";

function log(id: string, performedAt: string): WorkoutLog {
  return {
    id,
    sessionId: `session-${id}`,
    studentId: "student-1",
    performedAt,
    completionStatus: "COMPLETED",
    overallRpe: null,
    fatigue: null,
    comments: null,
    durationMinutes: 30,
    createdAt: performedAt,
    updatedAt: performedAt,
  };
}

describe("períodos de dos semanas del historial", () => {
  it("usa límites estables de lunes a domingo en la zona de la aplicación", () => {
    expect(workoutHistoryPeriodBounds("2026-11-09T03:00:00.000Z")).toEqual({
      startDate: "2026-11-09",
      endDate: "2026-11-22",
    });
    expect(workoutHistoryPeriodBounds("2026-11-23T02:59:59.000Z")).toEqual({
      startDate: "2026-11-09",
      endDate: "2026-11-22",
    });
    expect(workoutHistoryPeriodBounds("2026-11-23T03:00:00.000Z")).toEqual({
      startDate: "2026-11-23",
      endDate: "2026-12-06",
    });
  });

  it("solo crea períodos con registros y ordena cada uno del más reciente al más antiguo", () => {
    const periods = groupWorkoutLogsByPeriod([
      log("older-in-period", "2026-11-09T15:00:00.000Z"),
      log("old-cycle", "2026-08-03T15:00:00.000Z"),
      log("newer-in-period", "2026-11-13T15:00:00.000Z"),
    ]);

    expect(periods).toHaveLength(2);
    expect(periods[0].items.map((item) => item.id)).toEqual([
      "newer-in-period",
      "older-in-period",
    ]);
    expect(periods[1].items.map((item) => item.id)).toEqual(["old-cycle"]);
  });

  it("presenta rangos legibles incluso cuando cruzan mes o año", () => {
    expect(
      formatWorkoutHistoryPeriod({
        startDate: "2026-11-09",
        endDate: "2026-11-22",
      }),
    ).toBe("9–22 de noviembre de 2026");
    expect(
      formatWorkoutHistoryPeriod({
        startDate: "2026-12-28",
        endDate: "2027-01-10",
      }),
    ).toBe("28 de diciembre de 2026–10 de enero de 2027");
  });
});
