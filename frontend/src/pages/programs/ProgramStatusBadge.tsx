// Idéntico en criterio a ExerciseStatusBadge.tsx (PROMPT 07): "Activo"
// significa que el programa sigue disponible para asignar/editar; "Archivado"
// es la baja lógica reversible (PATCH /programs/:id/status).
export function ProgramStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'status-badge status-badge--active'
          : 'status-badge status-badge--inactive'
      }
    >
      {isActive ? 'Activo' : 'Archivado'}
    </span>
  );
}
