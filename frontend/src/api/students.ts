// Hooks de TanStack Query para la gestión de alumnos (PROMPT 04, punto 17).
// Toda la data remota pasa por acá: ninguna página guarda alumnos en useState
// propio ni cachea manualmente — se usa la caché de TanStack Query e
// invalidación explícita tras cada mutación, exactamente como pide PROMPT 04.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { PublicUser } from '../types/user';

export interface ListStudentsParams {
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

export interface InviteStudentResult {
  email: string;
  expiresAt: string;
  // Ver docs/security.md / docs/api.md: el backend retorna este token en
  // texto plano una única vez porque todavía no existe envío real de
  // correo. InviteStudentDialog lo muestra marcado explícitamente como
  // mecanismo temporal de desarrollo (nunca en producción sin advertencia).
  activationToken: string;
}

// Raíz de query key compartida por todas las queries/mutaciones de alumnos,
// para poder invalidar "todo lo de alumnos" de una sola vez si hiciera falta.
const studentsKeys = {
  all: ['students'] as const,
  lists: () => [...studentsKeys.all, 'list'] as const,
  list: (params: ListStudentsParams) =>
    [...studentsKeys.lists(), params] as const,
  details: () => [...studentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentsKeys.details(), id] as const,
};

function buildListQuery(params: ListStudentsParams): string {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.search) {
    query.set('search', params.search);
  }
  return `?${query.toString()}`;
}

export function useStudents(params: ListStudentsParams) {
  return useQuery({
    queryKey: studentsKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<PublicUser[], PaginationMeta>(
        `/students${buildListQuery(params)}`,
      );
      return { items: res.data, meta: res.meta };
    },
    // Evita el parpadeo de "cargando" al cambiar de página/búsqueda: se
    // mantienen los datos anteriores visibles hasta que llega la respuesta
    // nueva (TanStack Query v5, `placeholderData` con el identity function).
    placeholderData: (previousData) => previousData,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: studentsKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<PublicUser>(`/students/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useInviteStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await apiClient.post<InviteStudentResult>(
        '/students/invite',
        { email },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studentsKeys.lists() });
    },
  });
}

export function useUpdateStudentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiClient.patch<PublicUser>(`/students/${id}/status`, {
        isActive,
      });
      return res.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: studentsKeys.lists() });
      queryClient.setQueryData(studentsKeys.detail(updated.id), updated);
    },
  });
}
