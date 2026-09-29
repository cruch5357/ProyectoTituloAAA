import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getHomePathForRole } from '../auth/roleHome';

// Landing de "/": si ya hay sesión, cada rol tiene su propia pantalla de
// inicio (Coach -> dashboard, Alumno -> mis programas) y no tiene sentido
// mostrarle esta página; esto también resuelve el caso en que RequireAuth
// redirige acá a un usuario que intentó entrar a una ruta de otro rol. Si
// no hay sesión, se muestra una landing mínima con accesos a login/registro
// (PROMPT 17: no se agregan pantallas nuevas, se corrige el placeholder
// original de PROMPT 01).
export function HomePage() {
  const { status, user } = useAuth();

  if (status === 'authenticated' && user) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  return (
    <section className="home-page">
      <h1>Plataforma de Gestión y Seguimiento de Entrenamiento</h1>
      <p>
        Coordina programas de entrenamiento entre coach y alumnos: creación
        de ejercicios y programas, asignación a alumnos, registro de
        entrenamientos e historial de progreso.
      </p>
      <p className="home-page__actions">
        <Link to="/login">Iniciar sesión</Link>{' '}·{' '}
        <Link to="/register">Crear cuenta de coach</Link>
      </p>
    </section>
  );
}
