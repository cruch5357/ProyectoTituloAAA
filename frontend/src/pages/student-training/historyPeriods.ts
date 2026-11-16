import { todayDate } from "../../lib/calendarDate";
import type { WorkoutLog } from "../../types/workoutLog";

const DAY_MS = 86_400_000;
const PERIOD_DAYS = 14;
// 1970-01-05 was a Monday. A fixed anchor keeps every two-week interval
// stable instead of moving its limits according to the first visible log.
const PERIOD_ANCHOR_DAY = Date.parse("1970-01-05T00:00:00Z") / DAY_MS;

export interface WorkoutHistoryPeriod {
  key: string;
  startDate: string;
  endDate: string;
  items: WorkoutLog[];
}

function calendarDayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function calendarDate(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function workoutHistoryPeriodBounds(performedAt: string): {
  startDate: string;
  endDate: string;
} | null {
  const instant = new Date(performedAt);
  if (!Number.isFinite(instant.getTime())) return null;

  const performedDate = todayDate(instant);
  const dayNumber = calendarDayNumber(performedDate);
  const periodIndex = Math.floor(
    (dayNumber - PERIOD_ANCHOR_DAY) / PERIOD_DAYS,
  );
  const startDay = PERIOD_ANCHOR_DAY + periodIndex * PERIOD_DAYS;
  return {
    startDate: calendarDate(startDay),
    endDate: calendarDate(startDay + PERIOD_DAYS - 1),
  };
}

export function groupWorkoutLogsByPeriod(
  workoutLogs: WorkoutLog[],
): WorkoutHistoryPeriod[] {
  const grouped = new Map<string, WorkoutHistoryPeriod>();

  for (const workoutLog of workoutLogs) {
    const bounds = workoutHistoryPeriodBounds(workoutLog.performedAt);
    if (!bounds) continue;
    const key = bounds.startDate;
    const period = grouped.get(key) ?? { key, ...bounds, items: [] };
    period.items.push(workoutLog);
    grouped.set(key, period);
  }

  return Array.from(grouped.values())
    .map((period) => ({
      ...period,
      items: period.items
        .slice()
        .sort(
          (a, b) =>
            new Date(b.performedAt).getTime() -
            new Date(a.performedAt).getTime(),
        ),
    }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function dateParts(date: string): {
  day: string;
  month: string;
  year: string;
} {
  const instant = new Date(`${date}T12:00:00Z`);
  return {
    day: instant.toLocaleDateString("es-CL", {
      timeZone: "UTC",
      day: "numeric",
    }),
    month: instant.toLocaleDateString("es-CL", {
      timeZone: "UTC",
      month: "long",
    }),
    year: instant.toLocaleDateString("es-CL", {
      timeZone: "UTC",
      year: "numeric",
    }),
  };
}

export function formatWorkoutHistoryPeriod(
  period: Pick<WorkoutHistoryPeriod, "startDate" | "endDate">,
): string {
  const start = dateParts(period.startDate);
  const end = dateParts(period.endDate);

  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} de ${end.month} de ${end.year}`;
  }
  if (start.year === end.year) {
    return `${start.day} de ${start.month}–${end.day} de ${end.month} de ${end.year}`;
  }
  return `${start.day} de ${start.month} de ${start.year}–${end.day} de ${end.month} de ${end.year}`;
}
