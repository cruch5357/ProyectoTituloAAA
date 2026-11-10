import { assignmentWeekBounds, dateOnly } from './calendar-date';

export function computeAdherence(
  startDate: Date | null,
  sessions: {
    sessionId: string;
    date: string | null;
    completed: boolean;
    historyAmbiguous?: boolean;
    /** Prefer the global zero-based week index when it is available. */
    weekIndex?: number;
    /** Compatibility with training overview's global one-based week number. */
    weekNumber?: number;
    weekEnd?: string;
  }[],
  today: string,
) {
  if (!startDate)
    return { scheduledSessions: 0, completedSessions: 0, adherenceRate: null };
  dateOnly(today);
  const weekEnd = (session: (typeof sessions)[number]) => {
    if (session.weekEnd) return session.weekEnd;
    const index = Number.isInteger(session.weekIndex)
      ? session.weekIndex!
      : Number.isInteger(session.weekNumber) && session.weekNumber! > 0
        ? session.weekNumber! - 1
        : null;
    if (index !== null)
      return assignmentWeekBounds(startDate, index)?.weekEnd ?? null;
    // Transitional fallback for callers that only know the suggested date.
    // It still closes on Sunday instead of penalizing on that exact date.
    return session.date
      ? (assignmentWeekBounds(dateOnly(session.date), 0)?.weekEnd ?? null)
      : null;
  };
  const due = new Map(
    sessions
      .filter((s) => {
        const end = weekEnd(s);
        return end !== null && end < today;
      })
      .map((s) => [s.sessionId, s]),
  );
  const completed = new Set(
    sessions
      .filter((s) => due.has(s.sessionId) && s.completed)
      .map((s) => s.sessionId),
  );
  const ambiguous = [...due.values()].some(
    (s) => s.historyAmbiguous && !completed.has(s.sessionId),
  );
  return {
    scheduledSessions: due.size,
    completedSessions: completed.size,
    ...(ambiguous ? { insufficientReason: 'legacy-history' as const } : {}),
    adherenceRate:
      due.size && !ambiguous
        ? Math.round((completed.size / due.size) * 10000) / 100
        : null,
  };
}
