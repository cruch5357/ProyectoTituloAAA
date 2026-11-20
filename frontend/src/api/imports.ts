// Hooks de TanStack Query para la importación de Excel (PROMPT 13). Mismo
// criterio exacto que api/exercises.ts: toda la data remota pasa por acá,
// ninguna página guarda el batch en useState propio más allá del archivo
// seleccionado (que es puramente un input de formulario, no data del
// servidor).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { ExcelImportBatch } from '../types/excelImport';
import { libraryKey } from './blockLibrary';

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

// Confirma un batch PENDING_REVIEW propio: crea sus bloques en la biblioteca
// de Bloques, así que también se refresca esa lista.
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
      void queryClient.invalidateQueries({ queryKey: libraryKey });
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

// Descarga la plantilla .xlsx en español (generada por el backend con el
// catálogo de ejercicios del coach) y la guarda en el equipo.
export function useDownloadExcelTemplate() {
  return useMutation({
    mutationFn: async () => {
      const blob = await apiClient.blob('/imports/excel/template');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'plantilla-planificacion.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });
}
