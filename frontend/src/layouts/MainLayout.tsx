import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useStudents } from '../api/students';
import { Icon, type IconName } from '../components/ui/Icon';
import { ThemeSelect } from '../theme/ThemeProvider';
import { ErrorState, Skeleton } from '../components/ui/Primitives';

const coachLinks: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/students', label: 'Mis alumnos', icon: 'users' },
  { to: '/programs', label: 'Mis programas', icon: 'program' },
  { to: '/exercises', label: 'Ejercicios', icon: 'exercise' },
  { to: '/imports/excel', label: 'Importar Excel', icon: 'upload' },
];
const studentLinks: typeof coachLinks = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/training', label: 'Entrenamiento', icon: 'exercise' },
  { to: '/my-programs', label: 'Mis programas', icon: 'program' },
  { to: '/history', label: 'Historial', icon: 'chart' },
];
function QuickStudents() {
  const location = useLocation();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const query = useStudents({ page: 1, limit: 8, search });
  return (
    <section className="quick-students">
      <p className="eyebrow">Mis alumnos</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input);
        }}
      >
        <label className="sr-only" htmlFor="quick-search">
          Buscar alumnos
        </label>
        <input
          id="quick-search"
          type="search"
          placeholder="Buscar alumno…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>
      {query.isLoading && <Skeleton label="Cargando alumnos…" />}
      {query.isError && <ErrorState retry={() => void query.refetch()} />}
      {query.data?.items.map((student) => (
        <NavLink key={student.id} to={`/students/${student.id}`} className={({ isActive }) => isActive || location.pathname === `/dashboard/students/${student.id}` ? 'active' : undefined}>
          <span className="avatar">{student.name.slice(0, 1)}</span>
          <span>
            {student.name}
            <small>{student.isActive ? 'Activo' : 'Inactivo'}</small>
          </span>
        </NavLink>
      ))}
      {query.isSuccess && query.data.items.length === 0 && (
        <p className="muted">Sin alumnos para mostrar.</p>
      )}
      <Link className="text-link" to="/students">
        Ver todos los alumnos <Icon name="arrow" />
      </Link>
    </section>
  );
}
export function MainLayout() {
  const { status, user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState(false);
  const authenticated = status === 'authenticated' && !!user;
  const links = user?.role === 'COACH' ? coachLinks : studentLinks;
  const navigation = (mobile = false) =>
    (mobile ? links.slice(0, 4) : links).map((item) => (
      <NavLink
        end={item.to === '/' || item.to === '/dashboard'}
        key={item.to}
        to={item.to}
        title={item.label}
        onClick={() => setMore(false)}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </NavLink>
    ));
  return (
<div
  className={`app-shell ${authenticated ? 'app-shell--authenticated' : 'app-shell--public'} ${collapsed ? 'app-shell--collapsed' : ''} ${user?.role === 'STUDENT' ? 'app-shell--student' : ''}`}
>
  <a className="skip-link" href="#main-content">
    Saltar al contenido
  </a>

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
    </nav>

    <div className="topbar-actions">
      <ThemeSelect />
    </div>
  </header>

  {authenticated && (
    <aside className="sidebar" aria-label="Barra lateral">
      <Link className="brand" to="/">
        <span className="brand-mark">
          <Icon name="activity" />
        </span>
        <span className="brand-text">
          Entrenamiento<small>COACHING PLATFORM</small>
        </span>
      </Link>
      <button
        className="collapse-button"
        type="button"
        aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon name="collapse" />
      </button>
      <p className="eyebrow sidebar-label">Tu espacio</p>
      <nav className="sidebar-nav" aria-label="Navegación principal">
        {navigation()}
      </nav>
      {!collapsed && user.role === 'COACH' && <QuickStudents />}
      <div className="sidebar-footer">
        <span className="avatar">{user.name.slice(0, 1)}</span>
        <span className="brand-text">
          {user.name}
          <small>{user.role === 'COACH' ? 'Coach' : 'Alumno'}</small>
        </span>
      </div>
    </aside>
  )}

  <div className="app-main">
    <header className="topbar">
      {authenticated ? (
        <span className="topbar-context">
          {user.role === 'COACH' ? 'Espacio del coach' : 'Tu entrenamiento'}
        </span>
      ) : (
        <Link className="brand" to="/">
          <span className="brand-mark">
            <Icon name="activity" />
          </span>
          Entrenamiento
        </Link>
      )}
    </header>
  </div>
</div>
          )}
          <div className="topbar-actions">
            <ThemeSelect />
            {authenticated ? (
              <button
                type="button"
                className="quiet-button"
                onClick={() => void logout().catch(() => {})}
              >
                Cerrar sesión
              </button>
            ) : (
              <Link to="/login">Iniciar sesión</Link>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="app-shell__content">
          <Outlet />
        </main>
      </div>
      {authenticated && (
        <>
          <nav className="mobile-nav" aria-label="Navegación móvil">
            {navigation(true)}
            {links.length > 4 && (
              <button
                type="button"
                aria-expanded={more}
                aria-controls="mobile-more"
                onClick={() => setMore(!more)}
              >
                <Icon name="menu" />
                <span>Más</span>
              </button>
            )}
          </nav>
          {more && (
            <div id="mobile-more" className="mobile-more">
              <Link to="/imports/excel" onClick={() => setMore(false)}>
                <Icon name="upload" />
                Importar Excel
              </Link>
              <button type="button" onClick={() => setMore(false)}>
                Cerrar menú
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
