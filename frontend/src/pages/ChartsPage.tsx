import { useQuery } from "@tanstack/react-query"
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
} from "chart.js"
import dayjs from "dayjs"
import { useEffect, useMemo, useRef, useState } from "react"
import { Line } from "react-chartjs-2"
import { useParams } from "react-router-dom"
import { monitoringApi, operationsApi } from "../api/endpoints"
import type { HL7Result } from "../api/types"
import { OperationHeader } from "../components/OperationHeader"
import { EmptyState, QueryState } from "../components/ui/Feedback"
import { Card } from "../components/ui/Misc"
import { isActiveOperation } from "../utils/statuses"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

interface Series {
  code: string | string[]
  label: string
  color: string
}

const HEMODYNAMICS: Series[] = [
  { code: "MDC_ECG_HEART_RATE", label: "ЧСС, уд/мин", color: "#dc2626" },
  { code: "MDC_PULS_OXIM_PULS_RATE", label: "Пульс, уд/мин", color: "#f97316" },
  { code: ["MDC_PRESS_BLD_ART_ABP_SYS", "MDC_PRESS_BLD_NONINV_SYS"], label: "АД сист., мм рт.ст.", color: "#2563eb" },
  { code: ["MDC_PRESS_BLD_ART_ABP_DIA", "MDC_PRESS_BLD_NONINV_DIA"], label: "АД диаст., мм рт.ст.", color: "#60a5fa" },
  { code: ["MDC_PRESS_BLD_ART_ABP_MEAN", "MDC_PRESS_BLD_NONINV_MEAN"], label: "АД ср., мм рт.ст.", color: "#7c3aed" },
]
const RESPIRATION: Series[] = [
  { code: "MDC_PULS_OXIM_SAT_O2", label: "SpO₂, %", color: "#059669" },
  { code: ["MDC_CO2_RESP_RATE", "MDC_TTHOR_RESP_RATE"], label: "ЧДД, /мин", color: "#0891b2" },
  { code: "MDC_EEG_BISPECTRAL_INDEX", label: "BIS", color: "#a16207" },
  { code: "MDC_TEMP", label: "Температура, °C", color: "#be185d" },
]

export function valueOf(result: HL7Result, code: string | string[]): number | null {
  const codes = Array.isArray(code) ? code : [code]
  for (const name of codes) {
    const found = result.observations.find((o) => o.observation_name === name)
    if (found && found.observation_value !== "" && !Number.isNaN(Number(found.observation_value))) return Number(found.observation_value)
  }
  return null
}

function buildChart(results: HL7Result[], series: Series[]): ChartData<"line", (number | null)[], string> {
  return {
    labels: results.map((r) => dayjs(r.observation_at).format("HH:mm")),
    datasets: series.map((s) => ({
      label: s.label,
      data: results.map((r) => valueOf(r, s.code)),
      borderColor: s.color,
      backgroundColor: s.color,
      pointRadius: 0,
      borderWidth: 2,
      spanGaps: true,
      tension: 0.2,
    })),
  }
}

const OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: "index" as const, intersect: false },
  plugins: { legend: { position: "bottom" as const } },
  scales: { x: { ticks: { maxTicksLimit: 16 } } },
}

const REFRESH_MS = 30_000

export function ChartsPage() {
  const operationId = Number(useParams().operationId)
  const operation = useQuery({ queryKey: ["operation", String(operationId)], queryFn: () => operationsApi.get(operationId) })
  const initial = useQuery({ queryKey: ["monitoring", operationId], queryFn: () => monitoringApi.results(operationId) })
  const [results, setResults] = useState<HL7Result[]>([])
  const lastAt = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!initial.data) return
    setResults(initial.data.results)
    lastAt.current = initial.data.results.at(-1)?.observation_at
  }, [initial.data])

  // Для активного ОС новые измерения подгружаются инкрементально.
  const live = operation.data ? isActiveOperation(operation.data.status) : false
  useEffect(() => {
    if (!live) return
    const timer = setInterval(async () => {
      try {
        const fresh = await monitoringApi.results(operationId, lastAt.current)
        if (fresh.results.length) {
          setResults((current) => [...current, ...fresh.results])
          lastAt.current = fresh.results.at(-1)?.observation_at
        }
      } catch {
        /* следующая попытка через REFRESH_MS */
      }
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [live, operationId])

  const hemodynamics = useMemo(() => buildChart(results, HEMODYNAMICS), [results])
  const respiration = useMemo(() => buildChart(results, RESPIRATION), [results])
  const latest = results.at(-1)

  return (
    <div className="max-w-6xl">
      <OperationHeader operationId={operationId} />
      <QueryState isLoading={initial.isLoading} error={initial.error} onRetry={() => initial.refetch()}>
        {results.length === 0 ? (
          <EmptyState
            title="Нет данных мониторов"
            description={initial.data?.pid
              ? `Для PID «${initial.data.pid}» в окне операции измерения не поступали.`
              : "У операционного случая не указан PID пациента в мониторах — укажите его в наркозной карте."}
          />
        ) : (
          <div className="space-y-4">
            {latest && (
              <Card title={`Последнее измерение: ${dayjs(latest.observation_at).format("DD.MM.YYYY HH:mm:ss")}`}
                    actions={live && <span className="text-xs text-emerald-700">● обновление каждые 30 с</span>}>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
                  {[...HEMODYNAMICS, ...RESPIRATION].map((s) => (
                    <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">{s.label}</p>
                      <p className="text-lg font-semibold" style={{ color: s.color }}>{valueOf(latest, s.code) ?? "—"}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card title="Гемодинамика">
              <div className="h-72"><Line data={hemodynamics} options={OPTIONS} /></div>
            </Card>
            <Card title="Дыхание, оксигенация, BIS, температура">
              <div className="h-72"><Line data={respiration} options={OPTIONS} /></div>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  )
}
