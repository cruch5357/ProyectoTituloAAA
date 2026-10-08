import { BadRequestException } from '@nestjs/common';

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
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function sessionDate(
  start: Date | null,
  weekIndex: number,
  day: number | null,
): string | null {
  if (!start || day === null || day < 1 || day > 7) return null;
  const date = new Date(start);
  const startDay = date.getUTCDay() || 7;
  date.setUTCDate(
    date.getUTCDate() + weekIndex * 7 + ((day - startDay + 7) % 7),
  );
  return date.toISOString().slice(0, 10);
}
