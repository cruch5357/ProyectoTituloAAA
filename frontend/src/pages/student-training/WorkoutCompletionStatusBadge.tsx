import type { WorkoutCompletionStatus } from '../../types/workoutLog';

// Mismo criterio visual que AssignmentStatusBadge, adaptado al enum de
// WorkoutLog.completionStatus (COMPLETED/PARTIAL/SKIPPED).
const LABELS: Record<WorkoutCompletionStatus, string> = {
  COMPLETED: 'Completado',
  PARTIAL: 'Parcial',
  SKIPPED: 'Omitido',
};

export function WorkoutCompletionStatusBadge({
  status,
}: {
  status: WorkoutCompletionStatus;
}) {
  const isCompleted = status === 'COMPLETED';
  return (
    <span
      className={
        isCompleted
          ? 'status-badge status-badge--active'
          : 'status-badge status-badge--inactive'
      }
    >
      {LABELS[status]}
    </span>
  );
}
