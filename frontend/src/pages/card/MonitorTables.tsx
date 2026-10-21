import dayjs, { type Dayjs } from "dayjs"
import { useMemo } from "react"
import type { CMSPoint, CMSResponse, Pressure } from "../../api/types"
import { GridTables, type GridContext } from "./cardUi"

const GASES: Array<[keyof CMSPoint, string]> = [
  ["SEVOFL", "Севофлуран"],
  ["DESFL", "Десфлуран"],
  ["ISOFL", "Изофлуран"],
  ["AIR", "Воздух"],
  ["N2O", "Закись азота"],
  ["O2", "Кислород"],
]

/** Показатели ЦМС в порядке исходной системы; null — строка без данных мониторов. */
const CMS_ROWS: Array<[keyof CMSPoint | null, string]> = [
  [null, "ST (динамика сегмента)"],
  ["HEART_RATE", "ЧСС"],
  ["SpO2", "SpO2"],
  ["PRESS_BLD_NONINV", "НИАД"],
  ["PRESS_BLD_ART_ABP", "ИАД"],
  ["PRESS_BLD_VEN_CENT", "ЦВД"],
  ["PULS", "Пульс"],
  ["RESP_RATE", "ЧДД"],
  ["CO2", "EtCO2 (капнография/капнометрия)"],
  ["TEMP", "Температура"],
  ["BIS", "BIS (биспектральный индекс)"],
  [null, "TOF (нейромышечная проводимость)"],
]

const PRESSURE_KEYS = new Set<keyof CMSPoint>(["PRESS_BLD_NONINV", "PRESS_BLD_ART_ABP", "PRESS_BLD_VEN_CENT"])

/** Данные мониторов, сгруппированные по минуте (ключи ответа — концы 5-минутных интервалов от поступления). */
function useCmsByMinute(cms?: CMSResponse) {
  return useMemo(() => {
    const map = new Map<string, CMSPoint>()
    Object.entries(cms?.data ?? {}).forEach(([time, point]) => map.set(dayjs(time).format("YYYY-MM-DD HH:mm"), point))
    return map
  }, [cms])
}

function value(point: CMSPoint | undefined, key: keyof CMSPoint | null): string {
  if (!point || !key) return "-"
  const raw = point[key]
  if (raw !== null && typeof raw === "object") {
    const p = raw as Pressure
    return `${p.SYS ?? ""}\n${p.MEAN ?? ""}\n${p.DIA ?? ""}`
  }
  return (raw as string | null) || "-"
}

function MonitorTable({ grid, cms, corner, rows }: { grid: GridContext; cms?: CMSResponse; corner: string; rows: Array<[keyof CMSPoint | null, string]> }) {
  const byMinute = useCmsByMinute(cms)
  const at = (cell: Dayjs) => byMinute.get(cell.format("YYYY-MM-DD HH:mm"))
  return (
    <GridTables
      grid={grid}
      corner={corner}
      rows={rows.map(([key, label], index) => ({
        key: `${label}-${index}`,
        label,
        className: key && PRESSURE_KEYS.has(key) ? "pressure" : undefined,
        cell: (cell) => value(at(cell), key),
        totalBlocked: true,
      }))}
    />
  )
}

export const GasesTable = (props: { grid: GridContext; cms?: CMSResponse }) => <MonitorTable {...props} corner="Газы \ Время" rows={GASES} />
export const CMSTable = (props: { grid: GridContext; cms?: CMSResponse }) => <MonitorTable {...props} corner="Показатель \ Время" rows={CMS_ROWS} />
