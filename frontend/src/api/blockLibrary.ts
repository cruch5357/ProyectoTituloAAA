import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import type {
  CatalogItem,
  Folder,
  LibraryBlock,
} from "../pages/blocks/library-model";
export const libraryKey = ["block-library"];
export const useLibrary = () =>
  useQuery({
    queryKey: libraryKey,
    queryFn: async () =>
      (await apiClient.get<LibraryBlock[]>("/block-library")).data,
  });
export const useLibraryBlock = (id: string) =>
  useQuery({
    queryKey: [...libraryKey, id],
    enabled: Boolean(id),
    queryFn: async () =>
      (await apiClient.get<LibraryBlock>(`/block-library/${id}`)).data,
  });
export const useFolders = () =>
  useQuery({
    queryKey: ["block-folders"],
    queryFn: async () =>
      (await apiClient.get<Folder[]>("/block-library/folders")).data,
  });
export const useBlockCatalog = () =>
  useQuery({
    queryKey: ["block-catalog"],
    queryFn: async () =>
      (
        await apiClient.get<{
          exercises: CatalogItem[];
          modifiers: CatalogItem[];
        }>("/block-library/catalog")
      ).data,
  });
