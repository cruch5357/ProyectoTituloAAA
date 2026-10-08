import type { UserRole } from '../types/user';

// Ruta "de inicio" de cada rol dentro de los flujos ya existentes (ver
// AppRouter.tsx): un Coach aterriza en su dashboard, un Alumno en sus
// programas asignados. Centralizado acá para que LoginPage, RegisterPage y
// HomePage redirijan siempre de forma consistente (PROMPT 17: no se agregan
// rutas nuevas, solo se corrige a dónde apunta cada una según el rol).
export function getHomePathForRole(role: UserRole): string {
  return role === 'COACH' ? '/dashboard' : '/home';
}
