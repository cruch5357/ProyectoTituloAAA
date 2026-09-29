import { Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

// Layout base de la aplicación, ahora consciente de la sesión (PROMPT 04):
// muestra el link a "Mis alumnos" solo si hay un COACH autenticado, y
// login/logout según corresponda. Esto es ÚNICAMENTE una ayuda de UX —
// ocultar un link no es una barrera de seguridad (ver RequireAuth.tsx); la
// autorización real siempre la valida el backend.
export function MainLayout() {
  const { status, user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Link to="/" className="app-shell__brand">
          <span className="app-shell__brand-full">
            Plataforma de Gestión y Seguimiento de Entrenamiento
          </span>
          <span className="app-shell__brand-short">Entrenamiento</span>
        </Link>
        <nav className="app-shell__nav">
          {status === 'authenticated' && user?.role === 'COACH' && (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/students">Mis alumnos</Link>
              <Link to="/exercises">Catálogo de ejercicios</Link>
              <Link to="/programs">Mis programas</Link>
              <Link to="/imports/excel">Importar Excel</Link>
            </>
          )}
          {status === 'authenticated' && user?.role === 'STUDENT' && (
            <>
              <Link to="/my-programs">Mis programas asignados</Link>
              <Link to="/history">Mi historial</Link>
            </>
          )}
          {status === 'authenticated' && user && (
            <>
              <span>{user.name}</span>
              <button type="button" onClick={() => void logout()}>
                Cerrar sesión
              </button>
            </>
          )}
          {status === 'anonymous' && (
            <>
              <Link to="/login">Iniciar sesión</Link>
              <Link to="/register">Registrarme</Link>
            </>
          )}
        </nav>
      </header>
      <main className="app-shell__content">
        {/* Suspense (PROMPT 20): cubre la carga de las páginas con
            code-splitting por ruta (ver AppRouter.tsx). Mismo patrón de
            estado accesible ya usado en RequireAuth.tsx, para no introducir
            un componente de spinner nuevo solo para esto. */}
        <Suspense
          fallback={
            <p role="status" aria-live="polite">
              Cargando…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
