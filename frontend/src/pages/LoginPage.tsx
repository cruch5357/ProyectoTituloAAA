import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../lib/apiClient';

interface LocationState {
  from?: { pathname: string };
  registered?: boolean;
}

// Login mínimo (PROMPT 04, punto 13): un formulario, sin diseño visual
// definitivo. La validación real (credenciales, rate limiting) la hace
// siempre el backend; acá solo se muestra el resultado.
export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const locationState = location.state as LocationState | null;

  if (status === 'authenticated') {
    const redirectTo = locationState?.from?.pathname ?? '/students';
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      navigate('/students', { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No se pudo iniciar sesión.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-page">
      <h1>Iniciar sesión</h1>
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Correo</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />
        </label>

        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>

      {locationState?.registered && (
        <p role="status">Cuenta creada. Ya puedes iniciar sesión.</p>
      )}

      <p>
        ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
      </p>
    </section>
  );
}
