import type { ProgramAssignmentStatus } from '../../types/programAssignment';

// Mismo criterio visual que ProgramStatusBadge/ExerciseStatusBadge, adaptado
// al enum real del modelo (ACTIVE/FINISHED) en vez de un booleano.
export function AssignmentStatusBadge({
  status,
}: {
  status: ProgramAssignmentStatus;
}) {
  const isActive = status === 'ACTIVE';
  return (
    <span
      className={
        isActive
          ? 'status-badge status-badge--active'
          : 'status-badge status-badge--inactive'
      }
    >
      {isActive ? 'Activa' : 'Finalizada'}
    </span>
  );
}
