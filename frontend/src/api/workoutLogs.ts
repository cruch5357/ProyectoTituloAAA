// Hooks de TanStack Query para el registro de ejecución del Alumno (PROMPT
// 10): iniciar/consultar WorkoutLog, registrar SetLog y finalizar. Mismo
// criterio exacto que api/programAssignments.ts / api/sessionExercises.ts:
// toda la data remota pasa por acá, ninguna página cachea manualmente.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { SetLog, WorkoutCompletionStatus, WorkoutLog } from '../types/workoutLog';
import type { WorkoutEvolutionResult } from '../types/workoutEvolution';

export interface CreateSetLogItemPayload {
  sessionExerciseId: string;
  setNumber: number;
  actualReps?: number;
  actualLoad?: number;
  actualRpe?: number;
  actualRir?: number;
  comments?: string;
}

export interface FinishWorkoutLogPayload {
  completionStatus: WorkoutCompletionStatus;
  durationMinutes: number;
  overallRpe?: number;
  fatigue?: number;
  comments?: string;
}

const workoutLogsKeys = {
  all: ['workoutLogs'] as const,
  bySession: (sessionId: string) =>
    [...workoutLogsKeys.all, 'session', sessionId] as const,
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

// GET /sessions/:sessionId/workout-logs — WorkoutLog propios de esa sesión
// (para saber si ya se inició/hay uno para reanudar).
export function useSessionWorkoutLogs(sessionId: string | undefined) {
  return useQuery({
    queryKey: workoutLogsKeys.bySession(sessionId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<WorkoutLog[]>(
        `/sessions/${sessionId}/workout-logs`,
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
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

// POST /sessions/:sessionId/workout-logs — "iniciar entrenamiento".
export function useStartWorkoutLog(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<WorkoutLog>(
        `/sessions/${sessionId}/workout-logs`,
      );
      return res.data;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: workoutLogsKeys.bySession(sessionId),
      });
      queryClient.setQueryData(workoutLogsKeys.detail(created.id), created);
    },
  });
}

// POST /workout-logs/:id/set-logs — registra una o más series reales de una
// vez (batch atómico del lado del backend).
export function useAddSetLogs(workoutLogId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (setLogs: CreateSetLogItemPayload[]) => {
      const res = await apiClient.post<SetLog[]>(
        `/workout-logs/${workoutLogId}/set-logs`,
        { setLogs },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workoutLogsKeys.detail(workoutLogId),
      });
    },
  });
}

// PATCH /workout-logs/:id/finish — cierra el entrenamiento con el resumen de
// sesión (RF-23): cumplimiento, RPE general, fatiga y comentarios, todo en
// una sola acción. Puede repetirse dentro de la ventana de 24h (RF-24) para
// corregir el resumen ya enviado.
export function useFinishWorkoutLog(workoutLogId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FinishWorkoutLogPayload) => {
      const res = await apiClient.patch<WorkoutLog>(
        `/workout-logs/${workoutLogId}/finish`,
        payload,
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(workoutLogsKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({
        queryKey: workoutLogsKeys.bySession(updated.sessionId),
      });
    },
  });
}
