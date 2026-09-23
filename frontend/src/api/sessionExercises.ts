import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { SessionExercise } from '../types/sessionExercise';

// Payload de creación/edición de la prescripción de un ejercicio dentro de
// una sesión (PROMPT 08). `exerciseId` referencia un ejercicio YA EXISTENTE
// del catálogo (api/exercises.ts, PROMPT 07) — este módulo nunca crea
// ejercicios nuevos.
export interface CreateSessionExercisePayload {
  exerciseId: string;
  order?: number;
  targetSets?: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetRpe?: number;
  targetRir?: number;
  restSeconds?: number;
  notes?: string;
}

export type UpdateSessionExercisePayload = Partial<CreateSessionExercisePayload>;

const sessionExercisesKeys = {
  all: ['session-exercises'] as const,
  listBySession: (sessionId: string) =>
    [...sessionExercisesKeys.all, 'list', sessionId] as const,
  detail: (id: string) => [...sessionExercisesKeys.all, 'detail', id] as const,
};

export function useSessionExercises(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionExercisesKeys.listBySession(sessionId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<SessionExercise[]>(
        `/sessions/${sessionId}/exercises`,
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });
}

export function useCreateSessionExercise(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSessionExercisePayload) => {
      const res = await apiClient.post<SessionExercise>(
        `/sessions/${sessionId}/exercises`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: sessionExercisesKeys.listBySession(sessionId),
      });
    },
  });
}

export function useUpdateSessionExercise(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateSessionExercisePayload;
    }) => {
      const res = await apiClient.patch<SessionExercise>(
        `/session-exercises/${id}`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: sessionExercisesKeys.listBySession(sessionId),
      });
    },
  });
}
