import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useBackdropClose } from './useBackdropClose';

function TestDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(dialogRef);
  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        Abrir
      </button>
      <dialog ref={dialogRef} {...backdropClose} aria-label="Modal">
        <input aria-label="Campo" />
      </dialog>
    </>
  );
}

// Fija el rectángulo del diálogo (jsdom no calcula layout).
function openWithRect() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  const dialog = screen.getByLabelText('Modal', {
    selector: 'dialog',
  }) as HTMLDialogElement;
  dialog.getBoundingClientRect = () =>
    ({ left: 100, right: 500, top: 100, bottom: 400 }) as DOMRect;
  return dialog;
}

describe('useBackdropClose', () => {
  it('cierra el diálogo al hacer clic en el fondo', () => {
    render(<TestDialog />);
    const dialog = openWithRect();

    fireEvent.mouseDown(dialog, { clientX: 20, clientY: 20 });
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });

    expect(dialog.open).toBe(false);
  });

  it('no cierra con clics dentro del diálogo, ni en su padding', () => {
    render(<TestDialog />);
    const dialog = openWithRect();

    fireEvent.mouseDown(screen.getByLabelText('Campo'));
    fireEvent.click(screen.getByLabelText('Campo'));
    fireEvent.mouseDown(dialog, { clientX: 110, clientY: 110 });
    fireEvent.click(dialog, { clientX: 110, clientY: 110 });

    expect(dialog.open).toBe(true);
  });

  it('no cierra si el clic empezó dentro y terminó en el fondo (arrastre)', () => {
    render(<TestDialog />);
    const dialog = openWithRect();

    fireEvent.mouseDown(screen.getByLabelText('Campo'));
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });

    expect(dialog.open).toBe(true);
  });
});
