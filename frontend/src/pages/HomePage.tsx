import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getHomePathForRole } from '../auth/roleHome';

export function HomePage() {
  const { status, user } = useAuth();

  if (status === 'authenticated' && user) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  return (
    <section className="home-page">
      <h1>Plataforma de Gestión y Seguimiento de Entrenamiento</h1>
      <p>
        Coordina programas de entrenamiento entre coach y alumnos: creación de
        ejercicios y programas, asignación a alumnos, registro de entrenamientos
        e historial de progreso.
      </p>
      <p className="home-page__actions">
        <Link to="/login">Iniciar sesión</Link> ·{' '}
        <Link to="/register">Crear cuenta de coach</Link>
      </p>
    </section>
  );
}

export default HomePage;
