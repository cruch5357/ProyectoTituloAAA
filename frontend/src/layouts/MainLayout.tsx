import { Outlet } from 'react-router-dom';

// Layout base de la aplicación. Los layouts diferenciados por rol
// (CoachLayout desktop-first / StudentLayout mobile-first, ver
// docs/architecture.md) se construyen en el prompt de autenticación y
// navegación por rol, una vez exista sesión de usuario.
export function MainLayout() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <span>Plataforma de Gestión y Seguimiento de Entrenamiento</span>
      </header>
      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
