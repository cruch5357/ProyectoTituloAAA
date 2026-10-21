// Hooks de TanStack Query para el registro de ejecución del Alumno (PROMPT
// 10): iniciar/consultar WorkoutLog, registrar SetLog y finalizar. Mismo
// criterio exacto que api/programAssignments.ts / api/sessionExercises.ts:
// toda la data remota pasa por acá, ninguna página cachea manualmente.
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type {
  WorkoutCompletionStatus,
  WorkoutLog,
} from '../types/workoutLog';
import type { WorkoutEvolutionResult } from '../types/workoutEvolution';

const workoutLogsKeys = {
  all: ['workoutLogs'] as const,
  detail: (id: string) => [...workoutLogsKeys.all, 'detail', id] as const,
  history: (params: ListWorkoutLogsHistoryParams) =>
    [...workoutLogsKeys.all, 'history', params] as const,
  evolution: (params: WorkoutEvolutionParams) =>
    [...workoutLogsKeys.all, 'evolution', params] as const,
};

// PROMPT 11 (RF-25) — Historial y evolución básica del alumno. Mismo
// criterio de paginación/filtros que ListExercisesParams (api/exercises.ts,
// PROMPT 07): ningún filtro se resuelve en el frontend, todos viajan como
// query params y el backend hace el scoping por alumno autenticado.
export interface ListWorkoutLogsHistoryParams {
  page: number;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
  completionStatus?: WorkoutCompletionStatus;
  programId?: string;
  sessionId?: string;
  state?: 'in-progress';
  // Índice explícito: buildQueryString() recibe estos params como
  // Record<string, ...> para armar la query string de forma genérica (ver
  // más abajo) -- TypeScript exige que el tipo declare la firma de índice
  // para poder pasarlo así, aunque todas sus propiedades ya la cumplan.
  [key: string]: string | number | undefined;
}

export interface WorkoutLogsHistoryMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WorkoutEvolutionParams {
  dateFrom?: string;
  dateTo?: string;
  programId?: string;
  exerciseId?: string;
  [key: string]: string | number | undefined;
}

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

// GET /workout-logs — historial paginado y filtrable del alumno autenticado
// (RF-25). Mismo patrón exacto que useExercises: `placeholderData` evita el
// parpadeo de "cargando" al cambiar de página/filtros.
export function useWorkoutLogsHistory(params: ListWorkoutLogsHistoryParams) {
  return useQuery({
    queryKey: workoutLogsKeys.history(params),
    queryFn: async () => {
      const res = await apiClient.get<WorkoutLog[], WorkoutLogsHistoryMeta>(
        `/workout-logs${buildQueryString(params)}`,
      );
      return { items: res.data, meta: res.meta };
    },
    placeholderData: (previousData) => previousData,
  });
}

// GET /workout-logs/evolution — métricas descriptivas simples + (opcional)
// evolución de carga/reps de un ejercicio puntual (RF-25).
export function useWorkoutEvolution(params: WorkoutEvolutionParams) {
  return useQuery({
    queryKey: workoutLogsKeys.evolution(params),
    queryFn: async () => {
      const res = await apiClient.get<WorkoutEvolutionResult>(
        `/workout-logs/evolution${buildQueryString(params)}`,
      );
      return res.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useWorkoutLog(id: string | undefined) {
  return useQuery({
    queryKey: workoutLogsKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<WorkoutLog>(`/workout-logs/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

