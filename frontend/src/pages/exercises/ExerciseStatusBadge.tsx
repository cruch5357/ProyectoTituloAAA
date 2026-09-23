// Componente reutilizable y puramente presentacional, idéntico en criterio a
// StudentStatusBadge.tsx (PROMPT 04): no decide nada de negocio, solo
// traduce `isActive` a una etiqueta legible. Cada módulo de dominio (students,
// exercises) mantiene su propio componente colocado junto a sus páginas en
// vez de introducir una dependencia cruzada entre módulos.
export function ExerciseStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'status-badge status-badge--active'
          : 'status-badge status-badge--inactive'
      }
    >
      {isActive ? 'Activo' : 'Inactivo'}
    </span>
  );
}
