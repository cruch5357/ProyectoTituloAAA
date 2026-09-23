import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { Session } from '../types/session';

export interface CreateSessionPayload {
  name: string;
  dayOfWeek?: number;
  order?: number;
}

export type UpdateSessionPayload = Partial<CreateSessionPayload>;

const sessionsKeys = {
  all: ['sessions'] as const,
  listByWeek: (weekId: string) =>
    [...sessionsKeys.all, 'list', weekId] as const,
  detail: (id: string) => [...sessionsKeys.all, 'detail', id] as const,
};

export function useSessions(weekId: string | undefined) {
  return useQuery({
    queryKey: sessionsKeys.listByWeek(weekId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Session[]>(`/weeks/${weekId}/sessions`);
      return res.data;
    },
    enabled: Boolean(weekId),
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: sessionsKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Session>(`/sessions/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateSession(weekId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSessionPayload) => {
      const res = await apiClient.post<Session>(
        `/weeks/${weekId}/sessions`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: sessionsKeys.listByWeek(weekId),
      });
    },
  });
}

export function useUpdateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateSessionPayload;
    }) => {
      const res = await apiClient.patch<Session>(`/sessions/${id}`, payload);
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: sessionsKeys.listByWeek(updated.weekId),
      });
      queryClient.setQueryData(sessionsKeys.detail(updated.id), updated);
    },
  });
}
