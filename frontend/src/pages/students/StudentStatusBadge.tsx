// Componente reutilizable y puramente presentacional: no decide nada de
// negocio, solo traduce `isActive` a una etiqueta legible. Se usa tanto en
// el listado como en el detalle (PROMPT 04, punto 13 — componentes
// reutilizables).
export function StudentStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive ? 'status-badge status-badge--active' : 'status-badge status-badge--inactive'
      }
    >
      {isActive ? 'Activo' : 'Inactivo'}
    </span>
  );
}
