import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { activate, forgotPassword, resetPassword } from "../api/auth";
import { ApiError } from "../lib/apiClient";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage((await forgotPassword(email)).message);
    } catch {
      setError(
        "No se pudo procesar la solicitud. Intenta nuevamente en unos minutos.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login-page">
      <h1>Recuperar contraseña</h1>
      <p>
        Te enviaremos instrucciones si el correo corresponde a una cuenta
        activa.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Correo</span>
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        <button disabled={busy}>
          {busy ? "Enviando…" : "Enviar instrucciones"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <p>
        <Link to="/login">Volver al inicio de sesión</Link>
      </p>
    </section>
  );
}

export function AccountLinkPage({
  mode,
}: {
  mode: "activate" | "reset-password";
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(
    () => new URLSearchParams(location.search).get("token") ?? "",
  );
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const activation = mode === "activate";
  // Keep the token only in component memory; replace the sensitive history entry.
  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      if (activation) await activate(token, name, password);
      else await resetPassword(token, password);
      setToken("");
      setPassword("");
      setConfirmation("");
      setDone(true);
      if (activation)
        navigate("/login", { replace: true, state: { registered: true } });
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 401
          ? "El enlace es inválido, expiró o ya fue utilizado. Solicita uno nuevo."
          : "No se pudo completar la solicitud. Comprueba los datos e intenta nuevamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login-page">
      <h1>
        {activation ? "Activar cuenta de alumno" : "Restablecer contraseña"}
      </h1>
      {done ? (
        <p role="status">
          {activation ? "Cuenta activada." : "Contraseña restablecida."} Ya
          puedes iniciar sesión.
        </p>
      ) : !token ? (
        <p role="alert">
          Falta el enlace de acceso. Abre el enlace recibido por correo.
        </p>
      ) : (
        <form onSubmit={submit}>
          {activation && (
            <label className="field">
              <span>Nombre</span>
              <input
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <p className="muted">
            Usa de 10 a 128 caracteres, con al menos una letra y un número.
          </p>
          <label className="field">
            <span>Nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              pattern="(?=.*[A-Za-z])(?=.*[0-9]).+"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Confirmar contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy
              ? "Guardando…"
              : activation
                ? "Activar cuenta"
                : "Restablecer contraseña"}
          </button>
        </form>
      )}
      {!activation && !done && (
        <p>
          <Link to="/forgot-password">Solicitar otro enlace</Link>
        </p>
      )}
      {activation && !done && (
        <p>Si tu enlace expiró, pide a tu Coach que reenvíe la invitación.</p>
      )}
      <p>
        <Link to="/login" replace>
          Ir al inicio de sesión
        </Link>
      </p>
    </section>
  );
}
