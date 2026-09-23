import type { Session } from './session';
import type { SessionExercise } from './sessionExercise';

// Detalle de sesión con su prescripción embebida, vista del Alumno (ver
// backend/src/student-training/student-training.service.ts,
// getSessionDetail()). Mismos campos que Session, más `exercises`: idéntica
// prescripción que ya ve el Coach en SessionDetailPage, en solo lectura.
export interface StudentSessionDetail extends Session {
  exercises: SessionExercise[];
}
