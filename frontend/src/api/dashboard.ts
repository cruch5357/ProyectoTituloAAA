// Hooks de TanStack Query para el Dashboard del Coach (PROMPT 12, RF-26).
// Mismo criterio exacto que api/workoutLogs.ts (PROMPT 11): toda la data
// remota pasa por acá, ningún filtro se resuelve en el frontend -- el
// coachId real SIEMPRE sale del backend a partir del token, nunca se envía
// desde acá.
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { WorkoutLog, WorkoutCompletionStatus } from '../types/workoutLog';
import type {
  CoachDashboardSummary,
  RecentActivityMeta,
  StudentDashboardResult,
} from '../types/dashboard';

export interface RecentActivityParams {
  page: number;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
  completionStatus?: WorkoutCompletionStatus;
  // Índice explícito: mismo motivo que en api/workoutLogs.ts -- TypeScript
  // exige la firma de índice para pasar esta interfaz a buildQueryString().
  [key: string]: string | number | undefined;
}

export interface StudentDashboardParams {
  dateFrom?: string;
  dateTo?: string;
  programId?: string;
  exerciseId?: string;
  [key: string]: string | number | undefined;
}

const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
  recentActivity: (params: RecentActivityParams) =>
    [...dashboardKeys.all, 'recent-activity', params] as const,
  student: (studentId: string, params: StudentDashboardParams) =>
    [...dashboardKeys.all, 'student', studentId, params] as const,
};

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }
  const asString = query.toString();
  return asString ? `?${asString}` : '';
}

// GET /dashboard/summary — resumen agregado de todos los alumnos del coach
// autenticado.
export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: async () => {
      const res = await apiClient.get<CoachDashboardSummary>(
        '/dashboard/summary',
      );
      return res.data;
    },
  });
}

// GET /dashboard/recent-activity — actividad reciente paginada/filtrable de
// todos los alumnos del coach autenticado.
export function useRecentActivity(params: RecentActivityParams) {
  return useQuery({
    queryKey: dashboardKeys.recentActivity(params),
    queryFn: async () => {
      const res = await apiClient.get<WorkoutLog[], RecentActivityMeta>(
        `/dashboard/recent-activity${buildQueryString(params)}`,
      );
      return { items: res.data, meta: res.meta };
    },
    placeholderData: (previousData) => previousData,
  });
}

// GET /dashboard/students/:studentId — métricas de un alumno propio
// puntual. El backend responde 404 genérico si el alumno no existe o no es
// del coach autenticado -- acá simplemente se propaga ese error.
export function useStudentDashboard(
  studentId: string | undefined,
  params: StudentDashboardParams,
) {
  return useQuery({
    queryKey: dashboardKeys.student(studentId ?? '', params),
    queryFn: async () => {
      const res = await apiClient.get<StudentDashboardResult>(
        `/dashboard/students/${studentId}${buildQueryString(params)}`,
      );
      return res.data;
    },
    enabled: Boolean(studentId),
    placeholderData: (previousData) => previousData,
  });
}
