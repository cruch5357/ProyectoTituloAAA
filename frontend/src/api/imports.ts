// Hooks de TanStack Query para la importación de Excel (PROMPT 13). Mismo
// criterio exacto que api/exercises.ts: toda la data remota pasa por acá,
// ninguna página guarda el batch en useState propio más allá del archivo
// seleccionado (que es puramente un input de formulario, no data del
// servidor).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { ExcelImportBatch } from '../types/excelImport';

const excelImportsKeys = {
  all: ['excel-imports'] as const,
  detail: (id: string) => [...excelImportsKeys.all, 'detail', id] as const,
};

export function useUploadExcelImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.postFile<ExcelImportBatch>(
        '/imports/excel',
        formData,
      );
      return res.data;
    },
    onSuccess: (batch) => {
      queryClient.setQueryData(excelImportsKeys.detail(batch.id), batch);
    },
  });
}

export function useExcelImportBatch(id: string | undefined) {
  return useQuery({
    queryKey: excelImportsKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ExcelImportBatch>(`/imports/excel/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

// PROMPT 14: confirma un batch PENDING_REVIEW propio — normaliza sus filas
// válidas hacia Program/Block/Week/Session/SessionExercise. El resultado
// (incluido `createdPrograms`) reemplaza directamente la caché del detalle
// de este batch, igual que hace `useUploadExcelImport` con la vista previa.
export function useConfirmExcelImport(batchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ExcelImportBatch>(
        `/imports/excel/${batchId}/confirm`,
      );
      return res.data;
    },
    onSuccess: (batch) => {
      queryClient.setQueryData(excelImportsKeys.detail(batch.id), batch);
    },
  });
}

// PROMPT 14: rechaza un batch PENDING_REVIEW propio sin generar ninguna
// programación.
export function useRejectExcelImport(batchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ExcelImportBatch>(
        `/imports/excel/${batchId}/reject`,
      );
      return res.data;
    },
    onSuccess: (batch) => {
      queryClient.setQueryData(excelImportsKeys.detail(batch.id), batch);
    },
  });
}
