import { useQuery } from "@tanstack/react-query"
import { catalogsApi } from "../api/endpoints"
import type { CatalogItem, ID } from "../api/types"
import type { Option } from "../components/ui/Form"

/** Справочник из API с кешированием на всё время сессии. */
export function useCatalog(slug: string, params?: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: ["catalog", slug, params ?? {}],
    queryFn: () => catalogsApi.get(slug, params),
    staleTime: Infinity,
    enabled,
  })
}

export const toOptions = (items: CatalogItem[] | undefined): Option[] =>
  (items ?? []).map((item) => ({ value: item.id, label: item.name }))

export const nameOf = (items: CatalogItem[] | undefined, id: ID | null | undefined): string | undefined =>
  id == null ? undefined : items?.find((item) => item.id === Number(id))?.name
