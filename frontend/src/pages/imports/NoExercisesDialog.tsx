import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useBlockCatalog } from '../../api/blockLibrary';
import { useBackdropClose } from '../../lib/useBackdropClose';

// Sin ejercicios activos no se puede importar nada: cada fila del Excel debe
// usar un ejercicio del catálogo. Se avisa una vez al entrar, con la opción
// de cerrar o ir directo a crear el primer ejercicio.
export function NoExercisesDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(dialogRef);
  const catalog = useBlockCatalog();
  const shown = useRef(false);
  const empty =
    catalog.isSuccess &&
    Array.isArray(catalog.data?.exercises) &&
    catalog.data.exercises.length === 0;

  useEffect(() => {
    if (!empty || shown.current) return;
    shown.current = true;
    dialogRef.current?.showModal();
  }, [empty]);

  return (
    <dialog
      ref={dialogRef}
      {...backdropClose}
      className="invite-dialog"
      aria-labelledby="no-exercises-title"
    >
      <h2 id="no-exercises-title">No tienes ejercicios ingresados</h2>
      <p>
        Cada fila del Excel debe usar un ejercicio de tu catálogo, así que
        primero necesitas crear al menos uno. Después descarga la plantilla: tus
        ejercicios aparecerán en la lista desplegable.
      </p>
      <div className="dialog-actions">
        <button
          type="button"
          className="button--neutral"
          onClick={() => dialogRef.current?.close()}
        >
          Cerrar
        </button>
        <Link className="button button--primary" to="/exercises?nuevo=1">
          Crear ejercicio
        </Link>
      </div>
    </dialog>
  );
}
