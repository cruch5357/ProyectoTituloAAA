import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { Week } from '../types/week';

export interface CreateWeekPayload {
  number: number;
  order?: number;
}

export type UpdateWeekPayload = Partial<CreateWeekPayload>;

const weeksKeys = {
  all: ['weeks'] as const,
  listByBlock: (blockId: string) =>
    [...weeksKeys.all, 'list', blockId] as const,
  detail: (id: string) => [...weeksKeys.all, 'detail', id] as const,
};

export function useWeeks(blockId: string | undefined) {
  return useQuery({
    queryKey: weeksKeys.listByBlock(blockId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Week[]>(`/blocks/${blockId}/weeks`);
      return res.data;
    },
    enabled: Boolean(blockId),
  });
}

export function useWeek(id: string | undefined) {
  return useQuery({
    queryKey: weeksKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Week>(`/weeks/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateWeek(blockId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateWeekPayload) => {
      const res = await apiClient.post<Week>(
        `/blocks/${blockId}/weeks`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: weeksKeys.listByBlock(blockId),
      });
    },
  });
}

export function useUpdateWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateWeekPayload;
    }) => {
      const res = await apiClient.patch<Week>(`/weeks/${id}`, payload);
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: weeksKeys.listByBlock(updated.blockId),
      });
      queryClient.setQueryData(weeksKeys.detail(updated.id), updated);
    },
  });
}
