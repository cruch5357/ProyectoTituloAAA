// Hook de TanStack Query para editar una serie ya registrada (PROMPT 10,
// RF-24: ventana de edición de 24 horas, aplicada del lado del backend).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { SetLog } from '../types/workoutLog';

export interface UpdateSetLogPayload {
  actualReps?: number;
  actualLoad?: number;
  actualRpe?: number;
  actualRir?: number;
  comments?: string;
}

// Invalida el detalle del WorkoutLog dueño de la serie para refrescar la
// vista "prescrito vs. realizado" tras editar.
export function useUpdateSetLog(workoutLogId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateSetLogPayload;
    }) => {
      const res = await apiClient.patch<SetLog>(`/set-logs/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workoutLogs', 'detail', workoutLogId],
      });
    },
  });
}
