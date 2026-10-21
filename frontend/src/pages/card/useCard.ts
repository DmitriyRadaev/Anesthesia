import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cardApi } from "../../api/endpoints"
import type { ID } from "../../api/types"
import { useToast } from "../../components/ui/Toast"

export const cardKey = (operationId: ID, block: string) => ["card", operationId, block]

/** Все блоки наркозной карты (каждый — отдельный запрос с собственным состоянием загрузки). */
export function useCardQueries(operationId: ID) {
  const info = useQuery({ queryKey: cardKey(operationId, "patient-info"), queryFn: () => cardApi.patientInfo(operationId) })
  const actions = useQuery({ queryKey: cardKey(operationId, "actions"), queryFn: () => cardApi.actions(operationId) })
  const breath = useQuery({ queryKey: cardKey(operationId, "breath"), queryFn: () => cardApi.breath(operationId) })
  const stages = useQuery({ queryKey: cardKey(operationId, "stages"), queryFn: () => cardApi.stages(operationId) })
  const premedication = useQuery({
    queryKey: cardKey(operationId, "drugs/premedication"),
    queryFn: () => cardApi.drugs(operationId, "premedication"),
  })
  const introduction = useQuery({
    queryKey: cardKey(operationId, "drugs/introduction"),
    queryFn: () => cardApi.drugs(operationId, "introduction"),
  })
  const maintenance = useQuery({
    queryKey: cardKey(operationId, "drugs/maintenance"),
    queryFn: () => cardApi.drugs(operationId, "maintenance"),
  })
  const infusions = useQuery({ queryKey: cardKey(operationId, "infusions"), queryFn: () => cardApi.infusions(operationId) })
  const transfusions = useQuery({ queryKey: cardKey(operationId, "transfusions"), queryFn: () => cardApi.transfusions(operationId) })
  const liquids = useQuery({ queryKey: cardKey(operationId, "liquids"), queryFn: () => cardApi.liquids(operationId) })
  const cms = useQuery({ queryKey: cardKey(operationId, "cms"), queryFn: () => cardApi.cms(operationId), refetchInterval: 60_000 })
  return { info, actions, breath, stages, premedication, introduction, maintenance, infusions, transfusions, liquids, cms }
}

export type CardQueries = ReturnType<typeof useCardQueries>

/** Сохранение блока карты с обновлением кеша и связанных данных. */
export function useCardSave<TData, TResult>(operationId: ID, block: string, save: (data: TData) => Promise<TResult>) {
  const queryClient = useQueryClient()
  const notify = useToast()
  return useMutation({
    mutationFn: save,
    onSuccess: (result) => {
      queryClient.setQueryData(cardKey(operationId, block), result)
      if (block === "actions" || block === "pid-datetime") {
        // статус ОС пересчитывается на сервере, а окно ЦМС зависит от окончания анестезии
        queryClient.invalidateQueries({ queryKey: ["operation", String(operationId)] })
        queryClient.invalidateQueries({ queryKey: cardKey(operationId, "cms") })
        queryClient.invalidateQueries({ queryKey: cardKey(operationId, "patient-info") })
      }
      queryClient.invalidateQueries({ queryKey: cardKey(operationId, "totals") })
      notify("Сохранено")
    },
  })
}
