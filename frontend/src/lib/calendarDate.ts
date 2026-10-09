export const APP_TIMEZONE = __APP_TIMEZONE__;

export function todayDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function displayDateOnly(date: string): string {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', { timeZone: 'UTC' });
}

export function displayTimestampDate(date: string): string {
  return new Date(date).toLocaleDateString('es-CL', { timeZone: APP_TIMEZONE });
}
