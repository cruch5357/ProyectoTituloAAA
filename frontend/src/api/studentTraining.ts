// Hooks de TanStack Query para la navegación de solo lectura del Alumno
// sobre su propia prescripción (PROMPT 10): Program -> Block -> Week ->
// Session, filtrada por lo que el backend confirma que le fue asignado
// (nunca por un id que este frontend pudiera fabricar). Mismo criterio
// exacto que api/programAssignments.ts: toda la data remota pasa por acá.
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { Program } from '../types/program';
import type { Block } from '../types/block';
import type { Week } from '../types/week';
import type { Session } from '../types/session';
import type { StudentSessionDetail } from '../types/studentSessionDetail';

const studentTrainingKeys = {
  all: ['studentTraining'] as const,
  program: (id: string) => [...studentTrainingKeys.all, 'program', id] as const,
  blocks: (programId: string) =>
    [...studentTrainingKeys.all, 'blocks', programId] as const,
  block: (id: string) => [...studentTrainingKeys.all, 'block', id] as const,
  weeks: (blockId: string) =>
    [...studentTrainingKeys.all, 'weeks', blockId] as const,
  week: (id: string) => [...studentTrainingKeys.all, 'week', id] as const,
  sessions: (weekId: string) =>
    [...studentTrainingKeys.all, 'sessions', weekId] as const,
  sessionDetail: (sessionId: string) =>
    [...studentTrainingKeys.all, 'sessionDetail', sessionId] as const,
};

export function useStudentProgram(programId: string | undefined) {
  return useQuery({
    queryKey: studentTrainingKeys.program(programId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Program>(
        `/student/programs/${programId}`,
      );
      return res.data;
    },
    enabled: Boolean(programId),
  });
}

export function useStudentBlocks(programId: string | undefined) {
  return useQuery({
    queryKey: studentTrainingKeys.blocks(programId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Block[]>(
        `/student/programs/${programId}/blocks`,
      );
      return res.data;
    },
    enabled: Boolean(programId),
  });
}

export function useStudentBlock(blockId: string | undefined) {
  return useQuery({
    queryKey: studentTrainingKeys.block(blockId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Block>(`/student/blocks/${blockId}`);
      return res.data;
    },
    enabled: Boolean(blockId),
  });
}

export function useStudentWeeks(blockId: string | undefined) {
  return useQuery({
    queryKey: studentTrainingKeys.weeks(blockId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Week[]>(
        `/student/blocks/${blockId}/weeks`,
      );
      return res.data;
    },
    enabled: Boolean(blockId),
  });
}

export function useStudentWeek(weekId: string | undefined) {
  return useQuery({
    queryKey: studentTrainingKeys.week(weekId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Week>(`/student/weeks/${weekId}`);
      return res.data;
    },
    enabled: Boolean(weekId),
  });
}

export function useStudentSessions(weekId: string | undefined) {
  return useQuery({
    queryKey: studentTrainingKeys.sessions(weekId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<Session[]>(
        `/student/weeks/${weekId}/sessions`,
      );
      return res.data;
    },
    enabled: Boolean(weekId),
  });
}

// GET /student/sessions/:id — la sesión asignada + su prescripción completa
// de ejercicios (RF-21), en solo lectura.
export function useStudentSessionDetail(sessionId: string | undefined) {
  return useQuery({
    queryKey: studentTrainingKeys.sessionDetail(sessionId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<StudentSessionDetail>(
        `/student/sessions/${sessionId}`,
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });
}
