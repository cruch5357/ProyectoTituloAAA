import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">Entrenamiento · Seguimiento</p>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
export function StatCard({
  label,
  value,
  icon = 'activity',
}: {
  label: string;
  value: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="stat-card">
      <Icon name={icon} />
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="icon-tile">
        <Icon name="empty" />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Skeleton({
  label = 'Cargando información…',
}: {
  label?: string;
}) {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span>{label}</span>
      <i />
      <i />
      <i />
    </div>
  );
}
export function ErrorState({
  retry,
  message = 'No pudimos cargar la información.',
}: {
  retry?: () => void;
  message?: string;
}) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {retry && (
        <button type="button" onClick={retry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
