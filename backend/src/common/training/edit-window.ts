// Ventana de edición compartida por WorkoutLog y SetLog (RF-24,
// docs/requirements.md): "el alumno puede editar un registro dentro de una
// ventana de tiempo limitada (propuesto: 24 horas desde su creación;
// pendiente de validación con el equipo)". Se ancla SIEMPRE en
// `WorkoutLog.createdAt` (nunca en el `createdAt` de cada SetLog
// individual): un "registro" es la sesión completa (WorkoutLog + sus
// SetLog), así que todos sus datos comparten la misma ventana, evitando que
// dos series de un mismo entrenamiento queden editables en momentos
// distintos. Centralizado acá para que WorkoutLogsService y SetLogsService
// apliquen exactamente el mismo criterio sin duplicar la constante ni el
// cálculo.
import { UnprocessableEntityException } from '@nestjs/common';

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const EDIT_WINDOW_EXPIRED =
  'La ventana de 24 horas para editar este registro ya expiró';

export function ensureWithinEditWindow(anchor: Date): void {
  if (Date.now() - anchor.getTime() > EDIT_WINDOW_MS) {
    throw new UnprocessableEntityException(EDIT_WINDOW_EXPIRED);
  }
}
