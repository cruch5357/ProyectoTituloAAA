import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import type { CalendarSession } from "./coaching";
export type TrainingStatus =
  "NOT_STARTED" | "PARTIAL" | "COMPLETED" | "SKIPPED";
export const trainingLabels: Record<TrainingStatus, string> = {
  NOT_STARTED: "Pendiente",
  PARTIAL: "Parcial",
  COMPLETED: "Completado",
  SKIPPED: "Omitido",
};
export interface TrainingSessionSummary extends CalendarSession {
  dayNumber: number;
  status: TrainingStatus;
  recordedSets: number;
  totalSets: number;
  finished: boolean;
  workoutLogId: string | null;
  muscleGroups: string[];
  exerciseCount: number;
  legacy: boolean;
}
export interface TrainingAssignment {
  id: string;
  name: string;
  sourceBlockId: string | null;
  snapshotBlockId: string | null;
  startDate: string | null;
  status: "ACTIVE" | "FINISHED";
  legacy: boolean;
  weekCount: number;
  currentWeek: { blockName: string; weekNumber: number } | null;
  finishedSessions: number;
  totalSessions: number;
  adherence: {
    scheduledSessions: number;
    completedSessions: number;
    adherenceRate: number | null;
  };
}
export interface TrainingOverview {
  today: string;
  assignments: TrainingAssignment[];
  sessions: TrainingSessionSummary[];
  nextSession: TrainingSessionSummary | null;
  pendingSession: TrainingSessionSummary | null;
}
export interface ActualSet {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
}
export interface TrainingSet extends ActualSet {
  setNumber: number;
  priority: string;
  status: "PENDING" | "RECORDED" | "SKIPPED";
  actual: ActualSet;
}
export interface TrainingExercise {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroups: string[];
  notes: string | null;
  instructions: string | null;
  videoUrl: string | null;
  status: TrainingStatus;
  sets: TrainingSet[];
}
export interface TrainingDetail {
  id: string;
  name: string;
  blockName: string;
  assignmentId: string;
  studentId: string;
  weekNumber: number;
  dayNumber: number;
  cycleStatus: string;
  legacy: boolean;
  revision: number;
  workoutLogId: string | null;
  durationMinutes: number | null;
  finished: boolean;
  status: TrainingStatus;
  readOnly: boolean;
  exercises: TrainingExercise[];
}
export const useTraining = (studentId?: string) =>
  useQuery({
    queryKey: ["training", studentId ?? "me"],
    queryFn: async () =>
      (
        await apiClient.get<TrainingOverview>(
          studentId ? `/students/${studentId}/training` : "/training/me",
        )
      ).data,
  });
export const useTrainingSession = (id: string, assignmentId = "") =>
  useQuery({
    queryKey: ["training-session", id, assignmentId],
    refetchOnWindowFocus: false,
    queryFn: async () =>
      (
        await apiClient.get<TrainingDetail>(
          `/training/sessions/${id}${assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : ""}`,
        )
      ).data,
  });
export function trainingPayload(
  session: TrainingDetail,
  finish: boolean,
  durationMinutes?: number,
) {
  return {
    revision: session.revision,
    assignmentId: session.assignmentId,
    finish,
    durationMinutes,
    sets: session.exercises.flatMap((e) =>
      e.sets
        .filter((s) => s.status !== "PENDING")
        .map((s) => ({
          sessionExerciseId: e.id,
          setNumber: s.setNumber,
          status: s.status,
          ...s.actual,
        })),
    ),
  };
}
