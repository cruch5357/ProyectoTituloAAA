import { displayDateOnly } from '../lib/calendarDate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface Competition {
  id: string; studentId: string; name: string; eventDate: string; category: string;
  location: string | null; goal: string | null; coachGoal: string | null; notes: string | null;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED'; student?: { id: string; name: string };
}
export interface CalendarSession {
  id: string; sessionId: string; assignmentId: string; name: string; date: string | null;
  rescheduled?: boolean; originalDate?: string | null;
  programName: string; blockId: string; blockName: string; weekNumber: number; blockIndex: number; completed: boolean;
}
export interface CalendarData {
  competitions: Competition[]; competitionsTruncated: boolean;
  today: string; nextSession: CalendarSession | null; pendingSession: CalendarSession | null;
  nextCompetition: Competition | null; sessions: CalendarSession[];
  assignments: { adherence?: { insufficientReason?: 'legacy-history'; scheduledSessions: number; completedSessions: number; adherenceRate: number | null }; id: string; programId: string; name: string; startDate: string | null; currentWeek?: { blockName: string; weekNumber: number } | null }[];
}
export interface ProfileData {
  id: string; name: string; email: string; role: string;
  coach: { id: string; name: string; email: string } | null;
  profile: { displayName: string | null; avatarUrl: string | null; phone: string | null;
    birthDate: string | null; city: string | null; sport: string | null; bio: string | null } | null;
}
export interface Notice {
  id: string; title: string; body: string; readAt: string | null; createdAt: string;
  resourceType: string | null; resourceId: string | null;
}
export function useCoachingQuery<T>(path: string, enabled = true, interval?: number) {
  return useQuery({ queryKey: ['coaching', path], queryFn: async () => (await apiClient.get<T>(path)).data,
    enabled, refetchInterval: interval, refetchIntervalInBackground: false });
}
export function useCoachingMutation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ path, data, method = 'patch' }: { path: string; data?: unknown; method?: 'post' | 'patch' }) =>
    (await apiClient[method](path, data)).data,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['coaching'] }); void client.invalidateQueries({ queryKey: ['programAssignments'] }); } });
}
export const useCalendar = (studentId?: string, month?: string) => useCoachingQuery<CalendarData>((studentId ? `/students/${studentId}/calendar` : '/calendar/me') + (month ? `?month=${month}` : ''));
export const useProfile = () => useCoachingQuery<ProfileData>('/profile/me');
export const displayDate = displayDateOnly;
