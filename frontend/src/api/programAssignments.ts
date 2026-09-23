// Hooks de TanStack Query para la asignación de programas a alumnos
// (PROMPT 09). Mismo criterio exacto que api/programs.ts / api/students.ts:
// toda la data remota pasa por acá, ninguna página cachea manualmente.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type {
  ProgramAssignment,
  ProgramAssignmentStatus,
} from '../types/programAssignment';

const programAssignmentsKeys = {
  all: ['programAssignments'] as const,
  forProgram: (programId: string) =>
    [...programAssignmentsKeys.all, 'program', programId] as const,
  own: () => [...programAssignmentsKeys.all, 'me'] as const,
};

// GET /programs/:programId/assignments — vista Coach: todas las
// asignaciones de un programa propio, con el resumen del alumno embebido.
export function useProgramAssignments(programId: string | undefined) {
  return useQuery({
    queryKey: programAssignmentsKeys.forProgram(programId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ProgramAssignment[]>(
        `/programs/${programId}/assignments`,
      );
      return res.data;
    },
    enabled: Boolean(programId),
  });
}

// POST /programs/:programId/assign — un alumno por llamada (ver
// docs/api.md, "Estado de implementación (PROMPT 09)" sobre por qué no es
// un body de lista).
export function useAssignProgram(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentId: string) => {
      const res = await apiClient.post<ProgramAssignment>(
        `/programs/${programId}/assign`,
        { studentId },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: programAssignmentsKeys.forProgram(programId),
      });
    },
  });
}

// PATCH /program-assignments/:id/status — activa/finaliza una asignación
// propia (vista Coach).
export function useUpdateProgramAssignmentStatus(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: ProgramAssignmentStatus;
    }) => {
      const res = await apiClient.patch<ProgramAssignment>(
        `/program-assignments/${id}/status`,
        { status },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: programAssignmentsKeys.forProgram(programId),
      });
    },
  });
}

// GET /program-assignments/me — vista Alumno: únicamente las asignaciones
// propias (el backend filtra siempre por el alumno autenticado, nunca por
// un id que el cliente pueda enviar).
export function useMyProgramAssignments() {
  return useQuery({
    queryKey: programAssignmentsKeys.own(),
    queryFn: async () => {
      const res = await apiClient.get<ProgramAssignment[]>(
        '/program-assignments/me',
      );
      return res.data;
    },
  });
}
