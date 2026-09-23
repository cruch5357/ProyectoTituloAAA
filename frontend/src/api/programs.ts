// Hooks de TanStack Query para "Mis programas" (PROMPT 08). Mismo criterio
// exacto que api/exercises.ts (PROMPT 07).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { Program } from '../types/program';

export interface ListProgramsParams {
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

export interface CreateProgramPayload {
  name: string;
  description?: string;
  durationWeeks?: number;
}

export type UpdateProgramPayload = Partial<CreateProgramPayload>;

const programsKeys = {
  all: ['programs'] as const,
  lists: () => [...programsKeys.all, 'list'] as const,
  list: (params: ListProgramsParams) =>
    [...programsKeys.lists(), params] as const,
  details: () => [...programsKeys.all, 'detail'] as const,
  detail: (id: string) => [...programsKeys.details(), id] as const,
};

function buildListQuery(params: ListProgramsParams): string {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.search) {
    query.set('search', params.search);
  }
  return `?${query.toString()}`;
}

export function usePrograms(params: ListProgramsParams) {
  return useQuery({
    queryKey: programsKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<Program[], PaginationMeta>(
        `/programs${buildListQuery(params)}`,
      );
      return { items: res.data, meta: res.meta };
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useProgram(id: string | undefined) {
  return useQuery({
    queryKey: programsKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Program>(`/programs/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateProgramPayload) => {
      const res = await apiClient.post<Program>('/programs', payload);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: programsKeys.lists() });
    },
  });
}

export function useUpdateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateProgramPayload;
    }) => {
      const res = await apiClient.patch<Program>(`/programs/${id}`, payload);
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: programsKeys.lists() });
      queryClient.setQueryData(programsKeys.detail(updated.id), updated);
    },
  });
}

export function useUpdateProgramStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiClient.patch<Program>(`/programs/${id}/status`, {
        isActive,
      });
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: programsKeys.lists() });
      queryClient.setQueryData(programsKeys.detail(updated.id), updated);
    },
  });
}
