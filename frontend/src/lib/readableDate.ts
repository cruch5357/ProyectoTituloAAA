import { APP_TIMEZONE, todayDate } from './calendarDate';

// Compara días de calendario en la zona de la aplicación, incluso con DST.
export function readableDate(value: string, withTime = true, now = new Date()): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';
  const day = dateOnly ? value : todayDate(date);
  const current = todayDate(now);
  const dayNumber = (v: string) => Date.parse(`${v}T00:00:00Z`) / 86400000;
  const difference = dayNumber(current) - dayNumber(day);
  const weekday = new Date(`${current}T12:00:00Z`).getUTCDay();
  const monday = dayNumber(current) - (weekday + 6) % 7;
  const options = { timeZone: dateOnly ? 'UTC' : APP_TIMEZONE };
  const exact = date.toLocaleDateString('es-CL', {
    ...options, day: 'numeric', month: 'long',
    ...(day.slice(0, 4) !== current.slice(0, 4) ? { year: 'numeric' as const } : {}),
  });
  let label = exact;
  if (difference === 0) label = 'Hoy';
  else if (difference === 1) label = 'Ayer';
  else if (difference === 2) label = 'Anteayer';
  else if (difference === -1) label = 'Mañana';
  else if (difference > 2 && dayNumber(day) >= monday) label = `${date.toLocaleDateString('es-CL', { ...options, weekday: 'long' })}, ${exact}`;
  else if (dayNumber(day) >= monday - 7 && dayNumber(day) < monday) label = `Semana pasada · ${date.toLocaleDateString('es-CL', { ...options, weekday: 'long' })}, ${exact}`;
  return withTime && !dateOnly
    ? `${label} · ${date.toLocaleTimeString('es-CL', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })}`
    : label;
}
