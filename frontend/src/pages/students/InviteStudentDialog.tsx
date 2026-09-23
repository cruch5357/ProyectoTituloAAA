import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useInviteStudent } from '../../api/students';
import { ApiError } from '../../lib/apiClient';

// Formulario de invitación (PROMPT 04, punto 14). Usa el elemento nativo
// <dialog> (soportado en navegadores modernos) en vez de una librería de
// modales: evita agregar una dependencia nueva solo para esto, y ya trae
// accesibilidad básica (foco atrapado, cierre con Esc) de fábrica.
export function InviteStudentDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const inviteMutation = useInviteStudent();

  function openDialog() {
    setEmail('');
    inviteMutation.reset();
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await inviteMutation.mutateAsync(email);
    } catch {
      // El error ya queda disponible en inviteMutation.error para mostrarse
      // en el render; no hay nada adicional que hacer acá.
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog}>
        Invitar alumno
      </button>

      <dialog ref={dialogRef} className="invite-dialog">
        <form onSubmit={handleSubmit}>
          <h2>Invitar alumno</h2>
          <p>
            Se enviará una invitación de activación de cuenta al correo que
            ingreses. El alumno la usa para definir su propia contraseña.
          </p>

          <label className="field">
            <span>Correo del alumno</span>
            <input
              type="email"
              required
              maxLength={255}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={inviteMutation.isPending}
            />
          </label>

          {inviteMutation.isError && (
            <p role="alert" className="field-error">
              {inviteMutation.error instanceof ApiError
                ? inviteMutation.error.message
                : 'No se pudo enviar la invitación.'}
            </p>
          )}

          {inviteMutation.isSuccess && (
            <div className="dev-only-notice" role="status">
              <p>
                <strong>Invitación creada.</strong> Correo:{' '}
                {inviteMutation.data.email}.
              </p>
              <p>
                <strong>Solo en desarrollo:</strong> todavía no existe envío
                real de correo (ver <code>docs/security.md</code>). Copia y
                entrega manualmente este token de activación al alumno; este
                mecanismo debe reemplazarse por un envío de correo real antes
                de producción.
              </p>
              <code className="activation-token">
                {inviteMutation.data.activationToken}
              </code>
            </div>
          )}

          <div className="dialog-actions">
            <button
              type="submit"
              disabled={inviteMutation.isPending || email.length === 0}
            >
              {inviteMutation.isPending ? 'Enviando…' : 'Enviar invitación'}
            </button>
            <button type="button" onClick={closeDialog}>
              Cerrar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
