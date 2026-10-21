import { useQuery } from "@tanstack/react-query"
import dayjs, { type Dayjs } from "dayjs"
import type { ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { cardApi } from "../../api/endpoints"
import type { DrugGroup, ID } from "../../api/types"
import startMiniSvg from "../../assets/card/iconInfusionStartMini.svg?raw"
import stopMiniSvg from "../../assets/card/iconInfusionStopMini.svg?raw"
import { Button } from "../../components/ui/Button"
import { QueryState } from "../../components/ui/Feedback"
import { useCatalog } from "../../hooks/useCatalog"
import { drugMark, drugTotal, generateCells, inCell, spanMark, sumOf, type CellMark } from "./cardLogic"
import { actionOption, BREATH_OPTIONS, icons, STAGE_OPTIONS, Svg } from "./pictograms"
import { useCardQueries } from "./useCard"

interface Series<T> {
  data: Record<string, T>
}
interface DoseLine {
  drug: string
  text: string
}
interface CardPrint {
  general: Record<string, string | number | boolean | null>
  premedication: DoseLine[]
  introduction: DoseLine[]
  respiratory: Series<{ RESP_RATE: string | null }>
  hemodynamics: Series<{ SYS: string | null; DIA: string | null; MEAN: string | null; PULS: string | null }>
}

/** Шаг ячеек печатной формы и вместимость страниц — как в исходной системе (CardPDFDocument). */
const STEP = 5
const PAGE_CELLS = 30
const LAST_PAGE_CELLS = 26
const CELL_W = 30

/** Разбиение ячеек на страницы: на последней странице 26 ячеек (место под «Итого» и «Ед. изм.»). */
export function paginate<T>(cells: T[]): Array<{ cells: Array<T | null>; last: boolean }> {
  let pages = 1
  while (PAGE_CELLS * (pages - 1) + LAST_PAGE_CELLS < cells.length) pages += 1
  return Array.from({ length: pages }, (_, index) => {
    const last = index === pages - 1
    const size = last ? LAST_PAGE_CELLS : PAGE_CELLS
    const slice: Array<T | null> = cells.slice(index * PAGE_CELLS, index * PAGE_CELLS + size)
    while (slice.length < size) slice.push(null)
    return { cells: slice, last }
  })
}

const byMinute = <T,>(series?: Series<T>) => {
  const map = new Map<string, T>()
  Object.entries(series?.data ?? {}).forEach(([time, value]) => map.set(dayjs(time).format("YYYY-MM-DD HH:mm"), value))
  return map
}

const th = "border border-slate-200 bg-slate-100 p-0 text-center text-[8px] font-medium text-slate-400"
const td = "h-[20px] border border-slate-200 p-0 text-center text-[8px] text-slate-700"
const nameCell = "w-[90px] max-w-[90px] truncate border border-slate-200 bg-slate-100 py-0 pl-0.5 text-left text-[8px] font-medium text-slate-700"
const resultCell = "w-[60px] border border-slate-200 p-0 text-center text-[10px] text-slate-700"

function Mini({ svg, title }: { svg: string; title?: string }) {
  return <Svg src={svg} title={title} className="print-mini" />
}

function markIcon(mark: CellMark) {
  if (!mark) return "-"
  if (mark.kind === "bolus") return <Mini svg={icons.bolus} title={mark.title} />
  return <Mini svg={mark.kind === "stop" ? stopMiniSvg : startMiniSvg} title={mark.title} />
}

interface Row {
  name: string
  cell: (time: Dayjs) => ReactNode
  total?: ReactNode
  unit?: ReactNode
}

function PrintTable({ corner, cells, last, rows }: { corner: string; cells: Array<Dayjs | null>; last: boolean; rows: Row[] }) {
  return (
    <table className="mt-1 table-fixed border-collapse">
      <thead>
        <tr>
          <th className={`${th} w-[90px] text-left pl-0.5`}>{corner}</th>
          {cells.map((cell, i) => <th key={i} className={`${th} h-[20px]`} style={{ width: CELL_W }}>{cell ? cell.format("HH:mm") : "-"}</th>)}
          {last && <><th className={`${th} w-[60px] text-[10px]`}>Итого</th><th className={`${th} w-[60px] text-[10px]`}>Ед. изм.</th></>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className={nameCell} title={row.name}>{row.name}</td>
            {cells.map((cell, i) => <td key={i} className={td}>{cell ? row.cell(cell) : "-"}</td>)}
            {last && <><td className={resultCell}>{row.total}</td><td className={resultCell}>{row.unit}</td></>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Блок 5: АД (верхнее, среднее, нижнее) и пульс по ячейкам страницы. */
function HemodynamicsChart({ cells, last, values }: { cells: Array<Dayjs | null>; last: boolean; values: Map<string, CardPrint["hemodynamics"]["data"][string]> }) {
  const height = 150
  const max = 220
  const y = (v: number) => height - (Math.min(v, max) / max) * height
  const line = (key: "SYS" | "DIA" | "MEAN" | "PULS") =>
    cells
      .map((cell, i) => {
        const value = cell ? Number(values.get(cell.format("YYYY-MM-DD HH:mm"))?.[key]) : NaN
        return Number.isFinite(value) && value > 0 ? `${i * CELL_W + CELL_W / 2},${y(value)}` : null
      })
      .filter(Boolean)
      .join(" ")
  const series: Array<["SYS" | "DIA" | "MEAN" | "PULS", string, string, string?]> = [
    ["SYS", "Верхнее АД", "#2a78d6"],
    ["MEAN", "Среднее АД", "#1baf7a"],
    ["DIA", "Нижнее АД", "#1baf7a", "4 3"],
    ["PULS", "Пульс", "#6250d6", "2 2"],
  ]
  return (
    <div className="mt-1 flex">
      <div className="flex w-[90px] shrink-0 flex-col justify-between border border-slate-200 py-1 pl-0.5 text-[8px] text-slate-700">
        {series.map(([, label, color, dash]) => (
          <span key={label} className="flex items-center gap-1">
            <svg width="16" height="4" aria-hidden="true"><line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2" strokeDasharray={dash} /></svg>
            {label}
          </span>
        ))}
      </div>
      <svg width={cells.length * CELL_W} height={height} className="border border-l-0 border-slate-200" role="img" aria-label="График АД и пульса">
        {[40, 80, 120, 160, 200].map((v) => (
          <g key={v}>
            <line x1="0" x2={cells.length * CELL_W} y1={y(v)} y2={y(v)} stroke="#eaeff4" />
            <text x="2" y={y(v) - 1} fontSize="7" fill="#91a0c6">{v}</text>
          </g>
        ))}
        {series.map(([key, label, color, dash]) => (
          <polyline key={label} points={line(key)} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={dash} />
        ))}
      </svg>
      {last && <div className="w-[120px] border border-l-0 border-slate-200" />}
    </div>
  )
}

function Box({ area, children }: { area: string; children: ReactNode }) {
  return <section className="break-words border border-slate-200 px-1 text-[10px] leading-3 text-slate-700" style={{ gridArea: area }}>{children}</section>
}
const H = ({ children }: { children: ReactNode }) => <h6 className="inline text-[11px] font-medium text-slate-700">{children} </h6>

/** Печатная форма наркозной карты по образцу исходной (альбомный лист, страницы по 30 интервалов по 5 минут). */
export function CardPrintPage() {
  const operationId: ID = Number(useParams().operationId)
  const data = useCardQueries(operationId)
  const units = useCatalog("measurement_units")
  const print = useQuery({ queryKey: ["card-print", operationId], queryFn: () => cardApi.print(operationId) as Promise<unknown> as Promise<CardPrint> })
  const g = print.data?.general
  const actions = data.actions.data ?? []
  const stop = actions.find((a) => a.value === "ANESTHESIA_STOP")
  const arrival = g?.operation_date && g.operation_time ? dayjs(`${g.operation_date}T${String(g.operation_time).slice(0, 5)}`) : null
  const cells = arrival ? generateCells(arrival, STEP, stop ? dayjs(stop.time) : null) : []
  const pages = paginate(cells)
  const hemo = byMinute(print.data?.hemodynamics)
  const resp = byMinute(print.data?.respiratory)
  const unitName = (id: number) => units.data?.find((u) => u.id === id)?.name ?? ""
  const drugs: DrugGroup[] = [...(data.premedication.data ?? []), ...(data.introduction.data ?? []), ...(data.maintenance.data ?? [])]
  const infusions = data.infusions.data ?? []
  const transfusions = data.transfusions.data ?? []
  const liquids = data.liquids.data ?? []
  const breath = data.breath.data
  const stages = data.stages.data ?? []
  const fio = g ? `${g.surname} ${g.firstname} ${g.lastname ?? ""}` : ""

  const historyRows: Row[] = [
    {
      name: "Хар. дыхания",
      cell: (cell) => {
        const option = BREATH_OPTIONS.find((o) => breath?.[o.value].some((i) => inCell(i.time_start, cell, STEP) || (!cell.isBefore(i.time_start) && i.time_end !== null && !cell.isAfter(i.time_end))))
        return option ? <Mini svg={option.svg} title={option.description} /> : "-"
      },
    },
    {
      name: "Этапы",
      cell: (cell) => {
        const stage = stages.find((s) => inCell(s.time_start, cell, STEP))
        return stage ? <Mini svg={STAGE_OPTIONS[stage.stage - 1].svg} title={stage.description} /> : "-"
      },
    },
    {
      name: "События",
      cell: (cell) => {
        const action = actions.find((a) => inCell(a.time, cell, STEP))
        const option = action && actionOption(action.value)
        return option ? <Mini svg={option.svg} title={option.description} /> : action ? action.value_display : "-"
      },
    },
  ]

  return (
    <div className="mx-auto max-w-[1200px]">
      <style>{`.print-mini svg{width:14px;height:14px} @media print { @page { size: landscape; margin: 4mm } .card-print-page + .card-print-page { break-before: page } }`}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/operations/${operationId}/card`} className="text-sm font-medium text-slate-700 hover:underline">← К наркозной карте</Link>
        <Button onClick={() => window.print()}>Печать</Button>
      </div>
      <QueryState isLoading={print.isLoading || data.actions.isLoading} error={print.error ?? data.actions.error}>
        {!arrival && <p className="text-sm text-slate-500">Не указаны дата операции и время поступления — временная шкала не строится.</p>}
        {pages.map((page, index) => (
          <div key={index} className="card-print-page mb-8 overflow-x-auto rounded-lg bg-app-page p-1.5 shadow-app print:mb-0 print:shadow-none">
            {index === 0 && g && (
              <div className="mb-1 grid gap-0 text-slate-700" style={{ gridTemplateColumns: "repeat(6, 165px)", gridTemplateAreas: '"A A F F G G" "B B F F H H" "C C F F H H" "D D E E H H"' }}>
                <Box area="A"><H>ФИО</H>{fio}</Box>
                <Box area="B">{g.sex} {g.age ?? "—"} лет {g.weight ? `${Number(g.weight)} кг` : ""} {g.height ? `${Number(g.height)} см` : ""}</Box>
                <Box area="C"><div><H>Диагноз</H>{g.diagnosis_name}</div><div><H>Операция</H>{g.operation_name}</div></Box>
                <Box area="D"><H>Введение в анестезию</H>{print.data?.introduction.map((d) => d.text).join("; ")}{print.data?.introduction.length ? "." : ""}</Box>
                <Box area="E"><H>Премедикация</H>{print.data?.premedication.map((d) => d.text).join("; ")}{print.data?.premedication.length ? "." : ""}</Box>
                <Box area="F"><H>Непереносимость препаратов</H><div>{g.drug_intolerance || "—"}</div></Box>
                <Box area="G"><H>Дата</H>{g.operation_date ? dayjs(String(g.operation_date)).format("DD.MM.YYYY") : "—"}</Box>
                <Box area="H">
                  <div><H>№ ИБ</H>{g.history_number || "—"}</div>
                  <div><H>Отделение</H>{g.department ?? "—"}</div>
                  <div><H>Группа крови</H>{g.blood_group} <H>Rh</H>{g.blood_rh}</div>
                  <div><H>Риск по ASA</H>{g.asa ?? "—"}</div>
                  <div><H>По объему операции</H>{g.volume_operation ?? "—"}</div>
                  <div><H>{String(g.type_operation)}</H></div>
                  <div><H>Интубация трахеи</H>{g.tube_installed === null ? "—" : g.tube_installed ? "да" : "нет"}</div>
                  <div><H>Аппарат ИВЛ</H>{g.ventilator ?? "—"}</div>
                  <div><H>Мониторинг</H>{g.monitoring ?? "—"}</div>
                </Box>
              </div>
            )}
            <PrintTable corner="История \ Время" cells={page.cells} last={page.last} rows={historyRows} />
            {hemo.size > 0 && <HemodynamicsChart cells={page.cells} last={page.last} values={hemo} />}
            {drugs.length > 0 && (
              <PrintTable corner="Препарат \ Время" cells={page.cells} last={page.last} rows={drugs.map((group) => {
                const [total, unit] = drugTotal(group, unitName).split(" ")
                return { name: group.drug, cell: (cell: Dayjs) => markIcon(drugMark(group, cell, STEP)), total, unit }
              })} />
            )}
            {resp.size > 0 && (
              <PrintTable corner="Время" cells={page.cells} last={page.last}
                          rows={[{ name: "ЧД", cell: (cell) => resp.get(cell.format("YYYY-MM-DD HH:mm"))?.RESP_RATE ?? "-" }]} />
            )}
            {infusions.length + transfusions.length > 0 && (
              <PrintTable corner="Инфузия \ Время" cells={page.cells} last={page.last} rows={[
                ...infusions.map((group) => ({
                  name: group.solution,
                  cell: (cell: Dayjs) => markIcon(spanMark(group.items.map((i) => ({ ...i, title: i.dose })), cell, STEP)),
                  total: sumOf(group.items.map((i) => i.dose)), unit: "ml",
                })),
                ...transfusions.map((group) => ({
                  name: group.solution,
                  cell: (cell: Dayjs) => markIcon(spanMark(group.items.map((i) => ({ ...i, title: i.gemakon })), cell, STEP)),
                })),
              ]} />
            )}
            {liquids.length > 0 && (
              <PrintTable corner="Потери \ Время" cells={page.cells} last={page.last} rows={liquids.map((group) => ({
                name: group.liquid,
                cell: (cell: Dayjs) => markIcon(spanMark(group.items.map((i) => ({ ...i, title: i.volume })), cell, STEP)),
                total: sumOf(group.items.map((i) => i.volume)), unit: "ml",
              }))} />
            )}
            <div className="mt-2.5 flex justify-between text-[10px] text-slate-700">
              <span>{fio}</span>
              <span>{index + 1}</span>
            </div>
          </div>
        ))}
      </QueryState>
    </div>
  )
}
