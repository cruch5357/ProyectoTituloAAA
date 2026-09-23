// Hooks de TanStack Query para bloques (PROMPT 08). Los listados de
// blocks/weeks/sessions NO están paginados (ver docs/api.md, sección
// "Estado de implementación (PROMPT 08)"): un programa acumula un número
// acotado de bloques, a diferencia de /programs o /exercises.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { Block } from '../types/block';

export interface CreateBlockPayload {
  name: string;
  order?: number;
}

export type UpdateBlockPayload = Partial<CreateBlockPayload>;

const blocksKeys = {
  all: ['blocks'] as const,
  listByProgram: (programId: string) =>
    [...blocksKeys.all, 'list', programId] as const,
  detail: (id: string) => [...blocksKeys.all, 'detail', id] as const,
};

export function useBlocks(programId: string | undefined) {
  return useQuery({
    queryKey: blocksKeys.listByProgram(programId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Block[]>(
        `/programs/${programId}/blocks`,
      );
      return res.data;
    },
    enabled: Boolean(programId),
  });
}

export function useBlock(id: string | undefined) {
  return useQuery({
    queryKey: blocksKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Block>(`/blocks/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateBlock(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateBlockPayload) => {
      const res = await apiClient.post<Block>(
        `/programs/${programId}/blocks`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: blocksKeys.listByProgram(programId),
      });
    },
  });
}

export function useUpdateBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateBlockPayload;
    }) => {
      const res = await apiClient.patch<Block>(`/blocks/${id}`, payload);
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: blocksKeys.listByProgram(updated.programId),
      });
      queryClient.setQueryData(blocksKeys.detail(updated.id), updated);
    },
  });
}
