import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { register } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../lib/apiClient';

// Registro mínimo de Coach (PROMPT 06, punto 14): formulario funcional, sin
// diseño visual definitivo. La validación real (formato, longitud/patrón de
// contraseña, email único) la hace siempre el backend (RegisterDto +
// AuthService.register) — acá solo se agrega una verificación de UX
// (confirmación de contraseña) que el backend ni siquiera conoce.
//
// A diferencia de LoginPage, un registro exitoso NO autentica: el backend
// solo crea la cuenta (ver src/api/auth.ts). Por eso acá se redirige a
// /login en vez de guardar sesión.
export function RegisterPage() {
  const { status } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/students" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ name, email, password });
      navigate('/login', {
        replace: true,
        state: { registered: true },
      });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No se pudo completar el registro.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-page">
      <h1>Crear cuenta de Coach</h1>
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Nombre</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span>Correo</span>
          <input
            type="email"
            required
            maxLength={255}
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
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span>Confirmar contraseña</span>
          <input
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSubmitting}
          />
        </label>

        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p>
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </section>
  );
}
