import type { WorkoutCompletionStatus } from '../../types/workoutLog';

// Mismo criterio visual que AssignmentStatusBadge, adaptado al enum de
// WorkoutLog.completionStatus (COMPLETED/PARTIAL/SKIPPED).
const LABELS: Record<WorkoutCompletionStatus, string> = {
  COMPLETED: 'Completado',
  PARTIAL: 'Parcial',
  SKIPPED: 'Omitido',
};

const VARIANT_CLASS: Record<WorkoutCompletionStatus, string> = {
  COMPLETED: 'status-badge status-badge--active',
  PARTIAL: 'status-badge status-badge--warning',
  SKIPPED: 'status-badge status-badge--inactive',
};

export function WorkoutCompletionStatusBadge({
  status,
}: {
  status: WorkoutCompletionStatus;
}) {
  return <span className={VARIANT_CLASS[status]}>{LABELS[status]}</span>;
}
