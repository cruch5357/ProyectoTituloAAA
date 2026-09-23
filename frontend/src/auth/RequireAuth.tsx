import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import type { UserRole } from '../types/user';

// Guard de ruta (PROMPT 04, punto 16). Redirige a /login si no hay sesión,
// y opcionalmente restringe por rol. Es SOLO una ayuda de UX: el backend
// vuelve a validar todo de forma independiente (ver AuthContext.tsx).
export function RequireAuth({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <p role="status" aria-live="polite">
        Verificando sesión…
      </p>
    );
  }

  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
