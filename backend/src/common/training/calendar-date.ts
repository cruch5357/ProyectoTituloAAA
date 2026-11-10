import { BadRequestException } from '@nestjs/common';
import { getAppTimezone } from '../../config/timezone';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AssignmentWeekState = 'FUTURE' | 'ACTIVE' | 'EXPIRED';

export type AssignmentWeekBounds = {
  /** Calendar Monday, even when the first assignment week starts later. */
  weekStart: string;
  /** First day on which this assignment week can be performed. */
  availableFrom: string;
  weekEnd: string;
};

/** Date-only arithmetic: UTC is a transport representation, never a local midnight. */
export function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException('Fecha inválida');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Fecha inválida');
  return date;
}
export function todayDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const isoDate = (value: Date) => value.toISOString().slice(0, 10);

const addUtcDays = (value: Date, days: number) => {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

/**
 * Resolves a prescribed week using calendar weeks (Monday through Sunday).
 * Week zero can be partial: it is only available from the assignment start.
 */
export function assignmentWeekBounds(
  start: Date | null,
  weekIndex: number,
): AssignmentWeekBounds | null {
  if (!start || !Number.isInteger(weekIndex) || weekIndex < 0) return null;
  const startDate = dateOnly(isoDate(start));
  const mondayOffset = (startDate.getUTCDay() + 6) % 7;
  const firstWeekStart = addUtcDays(startDate, -mondayOffset);
  const weekStart = addUtcDays(firstWeekStart, weekIndex * 7);
  const weekEnd = addUtcDays(weekStart, 6);
  return {
    weekStart: isoDate(weekStart),
    availableFrom: weekIndex === 0 ? isoDate(startDate) : isoDate(weekStart),
    weekEnd: isoDate(weekEnd),
  };
}

/** Returns -1 before the assignment starts or when it has no start date. */
export function assignmentWeekIndex(start: Date | null, today: string): number {
  const currentDate = dateOnly(today);
  const firstWeek = assignmentWeekBounds(start, 0);
  if (!firstWeek || today < firstWeek.availableFrom) return -1;
  return Math.floor(
    (currentDate.getTime() - dateOnly(firstWeek.weekStart).getTime()) /
      (7 * DAY_MS),
  );
}

export function assignmentWeekState(
  start: Date | null,
  weekIndex: number,
  today: string,
): AssignmentWeekState | null {
  dateOnly(today);
  const bounds = assignmentWeekBounds(start, weekIndex);
  if (!bounds) return null;
  if (today < bounds.availableFrom) return 'FUTURE';
  if (today > bounds.weekEnd) return 'EXPIRED';
  return 'ACTIVE';
}

export function sessionDate(
  start: Date | null,
  weekIndex: number,
  day: number | null,
): string | null {
  const bounds = assignmentWeekBounds(start, weekIndex);
  if (!bounds || day === null || day < 1 || day > 7) return null;
  const suggested = addUtcDays(dateOnly(bounds.weekStart), day - 1);
  // A weekday before a mid-week assignment start cannot be suggested in the
  // past. Clamp it to the first available day without changing week identity.
  return suggested < dateOnly(bounds.availableFrom)
    ? bounds.availableFrom
    : isoDate(suggested);
}

export function effectiveSessionDate(
  start: Date | null,
  weekIndex: number,
  day: number | null,
  override?: { scheduledDate: Date } | null,
): string | null {
  return override
    ? override.scheduledDate.toISOString().slice(0, 10)
    : sessionDate(start, weekIndex, day);
}
