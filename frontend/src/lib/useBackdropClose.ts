import { useRef } from 'react';
import type { MouseEvent, RefObject } from 'react';

// Cierra un <dialog> modal al hacer clic en el fondo difuminado. En un
// <dialog> nativo los clics sobre el ::backdrop llegan con el propio dialog
// como target, igual que los clics en su padding; por eso se compara la
// posición con el rectángulo del diálogo. Solo se cierra si el clic empezó y
// terminó afuera: arrastrar una selección de texto desde un input hasta el
// fondo no debe cerrar el formulario.
export function useBackdropClose(dialogRef: RefObject<HTMLDialogElement | null>) {
  const pressedOutside = useRef(false);

  function isOutside(event: MouseEvent<HTMLDialogElement>): boolean {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }

  return {
    onMouseDown: (event: MouseEvent<HTMLDialogElement>) => {
      pressedOutside.current = isOutside(event);
    },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      if (pressedOutside.current && isOutside(event)) {
        dialogRef.current?.close();
      }
      pressedOutside.current = false;
    },
  };
}
