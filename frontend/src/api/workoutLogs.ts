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

const WORKOUT_LOGS_HISTORY_BATCH_SIZE = 100;

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

async function getWorkoutLogsHistoryPage(
  params: ListWorkoutLogsHistoryParams,
  page: number,
) {
  const res = await apiClient.get<WorkoutLog[], WorkoutLogsHistoryMeta>(
    `/workout-logs${buildQueryString({
      page,
      limit: WORKOUT_LOGS_HISTORY_BATCH_SIZE,
      ...params,
    })}`,
  );
  return { items: res.data, meta: res.meta };
}

// GET /workout-logs — reúne el historial filtrado usando la paginación ya
// existente de la API. Los períodos temporales se forman después en la vista,
// de modo que un límite de filas del transporte nunca corte un período ni
// oculte ciclos antiguos.
export function useWorkoutLogsHistory(params: ListWorkoutLogsHistoryParams) {
  return useQuery({
    queryKey: workoutLogsKeys.history(params),
    queryFn: async () => {
      const firstPage = await getWorkoutLogsHistoryPage(params, 1);
      const remainingPages = await Promise.all(
        Array.from(
          { length: Math.max(0, firstPage.meta.totalPages - 1) },
          (_, index) => getWorkoutLogsHistoryPage(params, index + 2),
        ),
      );
      const seen = new Set<string>();
      const items = [firstPage, ...remainingPages]
        .flatMap((result) => result.items)
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      return {
        items,
        meta: {
          ...firstPage.meta,
          page: 1,
          limit: WORKOUT_LOGS_HISTORY_BATCH_SIZE,
          totalPages: 1,
        },
      };
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

