export function computeAdherence(
  startDate: Date | null,
  sessions: {
    sessionId: string;
    date: string | null;
    completed: boolean;
    historyAmbiguous?: boolean;
  }[],
  today: string,
) {
  if (!startDate)
    return { scheduledSessions: 0, completedSessions: 0, adherenceRate: null };
  const due = new Map(
    sessions
      .filter((s) => s.date !== null && s.date <= today)
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
