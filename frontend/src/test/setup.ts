// Setup global de pruebas (PROMPT 07 — primera infraestructura de testing de
// frontend del proyecto; docs/testing.md ya la contemplaba como parte del
// plan desde PROMPT 00, sección "Unit testing / Frontend"). Se ejecuta antes
// de cada archivo de prueba (ver vite.config.ts, `test.setupFiles`).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Desmonta el árbol de React renderizado por cada prueba, para que un
// componente montado en una prueba no quede residualmente en el DOM de la
// siguiente (mismo problema que "no compartir estado entre tests" en jest).
afterEach(() => {
  cleanup();
});

// jsdom no implementa <dialog>.showModal()/close() (los deja como stubs que
// lanzan "Not implemented" — ver https://github.com/jsdom/jsdom/issues/3294).
// InviteStudentDialog/ExerciseFormDialog usan el elemento nativo <dialog>
// (PROMPT 04/07), así que se agrega acá un polyfill mínimo únicamente para
// que las pruebas puedan abrir/cerrar el diálogo; no cambia ningún
// comportamiento real de la aplicación en el navegador.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}
