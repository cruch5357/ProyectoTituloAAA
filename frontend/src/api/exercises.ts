// Hooks de TanStack Query para el catálogo de ejercicios del coach (PROMPT
// 07). Mismo criterio exacto que api/students.ts (PROMPT 04): toda la data
// remota pasa por acá, ninguna página guarda ejercicios en useState propio,
// se usa la caché de TanStack Query con invalidación explícita tras cada
// mutación.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { Exercise } from '../types/exercise';

export interface ListExercisesParams {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CreateExercisePayload {
  name: string;
  muscleGroup?: string;
  instructions?: string;
  videoUrl?: string;
}

export type UpdateExercisePayload = Partial<CreateExercisePayload>;

// Raíz de query key compartida por todas las queries/mutaciones de
// ejercicios, igual que studentsKeys en api/students.ts.
const exercisesKeys = {
  all: ['exercises'] as const,
  lists: () => [...exercisesKeys.all, 'list'] as const,
  list: (params: ListExercisesParams) =>
    [...exercisesKeys.lists(), params] as const,
  details: () => [...exercisesKeys.all, 'detail'] as const,
  detail: (id: string) => [...exercisesKeys.details(), id] as const,
};

function buildListQuery(params: ListExercisesParams): string {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.search) {
    query.set('search', params.search);
  }
  return `?${query.toString()}`;
}

export function useExercises(params: ListExercisesParams) {
  return useQuery({
    queryKey: exercisesKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<Exercise[], PaginationMeta>(
        `/exercises${buildListQuery(params)}`,
      );
      return { items: res.data, meta: res.meta };
    },
    // Igual que useStudents: evita el parpadeo de "cargando" al cambiar de
    // página/búsqueda.
    placeholderData: (previousData) => previousData,
  });
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: exercisesKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Exercise>(`/exercises/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateExercisePayload) => {
      const res = await apiClient.post<Exercise>('/exercises', payload);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: exercisesKeys.lists() });
    },
  });
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateExercisePayload;
    }) => {
      const res = await apiClient.patch<Exercise>(`/exercises/${id}`, payload);
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: exercisesKeys.lists() });
      queryClient.setQueryData(exercisesKeys.detail(updated.id), updated);
    },
  });
}

export function useUpdateExerciseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiClient.patch<Exercise>(`/exercises/${id}/status`, {
        isActive,
      });
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: exercisesKeys.lists() });
      queryClient.setQueryData(exercisesKeys.detail(updated.id), updated);
    },
  });
}
