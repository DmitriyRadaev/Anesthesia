import { useQuery } from "@tanstack/react-query"
import dayjs, { type Dayjs } from "dayjs"
import { useEffect, useId, useRef, useState } from "react"
import { medicamentsApi } from "../../api/endpoints"
import type { TimeInterval } from "../../api/types"
import { Modal } from "../../components/ui/Modal"
import { hasOverlaps, hhmm, resolveTime, type CellMark } from "./cardLogic"
import { AnesButton, AnesInput, AnesSelect, CellIcon, GridTables, NoticeModal, type GridContext } from "./cardUi"
import { icons, Svg } from "./pictograms"

/** Строка модального окна: значения полей как строки, время — ЧЧ:ММ. */
export type FormRow = Record<string, string>

export interface FieldDef {
  key: string
  label: string
  kind: "select" | "number" | "text"
  options?: (row: FormRow, name: string) => Array<{ value: string | number; label: string }>
  adornment?: string
  /** Сбросить другие поля при изменении (тип введения сбрасывает единицу измерения). */
  resets?: string[]
}

type GroupLike = { items: TimeInterval[] }
type ItemOf<G extends GroupLike> = G["items"][number]

export interface GroupTableConfig<G extends GroupLike> {
  corner: string
  addLabel: string
  modalTitle: string
  totalTitle?: string
  nameField: keyof G & string
  /** Источник наименований: поиск по справочнику ЛС или фиксированный список. */
  names: "medicaments" | string[]
  fields: FieldDef[]
  /** Сетка полей строки модального окна (grid-template-columns). */
  columns: string
  timeStartLabel?: (row: FormRow) => string
  showTimeEnd?: (row: FormRow) => boolean
  /** Продолжающийся интервал без окончания считается бесконечным при проверке пересечений. */
  isOngoing?: (row: FormRow) => boolean
  emptyRow: () => FormRow
  toRow: (item: ItemOf<G>) => FormRow
  toItem: (row: FormRow, times: TimeInterval) => ItemOf<G>
  mark: (group: G, cell: Dayjs, interval: number) => CellMark
  /** Значение колонки «Итого»; undefined — колонка заблокирована. */
  total?: (group: G) => string
}

interface Props<G extends GroupLike> {
  config: GroupTableConfig<G>
  grid: GridContext
  arrival: Dayjs | null
  groups: G[]
  saving: boolean
  onSave: (groups: G[]) => Promise<unknown>
  testId?: string
}

const isNumber = (value: string) => /^\d+([.,]\d+)?$/.test(value.trim())

function MedicamentSearch({ value, onSelect }: { value: string; onSelect: (name: string) => void }) {
  const [text, setText] = useState(value)
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const blurTimer = useRef<number>()
  useEffect(() => setText(value), [value])
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text), 300)
    return () => window.clearTimeout(timer)
  }, [text])
  const search = useQuery({ queryKey: ["medicaments", query], queryFn: () => medicamentsApi.search(query), enabled: open, staleTime: 60_000 })
  const options = search.data?.results ?? []
  return (
    <div className="relative w-full">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Препарат"
        className="anes-input"
        placeholder="Начните вводить название препарата"
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => (blurTimer.current = window.setTimeout(() => setOpen(false), 150))}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="anes-combobox-list">
          {search.isFetching && options.length === 0 && <li aria-disabled="true">Загрузка…</li>}
          {!search.isFetching && options.length === 0 && <li aria-disabled="true">Препаратов не найдено</li>}
          {options.map((option) => (
            <li key={option.id} role="option" aria-selected={option.name === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  window.clearTimeout(blurTimer.current)
                  setText(option.name)
                  setOpen(false)
                  onSelect(option.name)
                }}>
              {option.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Таблица препаратов / растворов / потерь: строки — наименования, ячейки — пиктограммы введения по времени, «Итого».
 * Щелчок по строке открывает модальное окно со всеми интервалами наименования; «Добавить» сохраняет таблицу сразу.
 */
export function GroupTable<G extends GroupLike>({ config, grid, arrival, groups, saving, onSave, testId }: Props<G>) {
  const [modal, setModal] = useState(false)
  const [name, setName] = useState("")
  const [rows, setRows] = useState<FormRow[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const nameOf = (group: G) => String(group[config.nameField])
  const fill = (target: string) => {
    const existing = groups.find((g) => nameOf(g) === target)
    setName(target)
    setRows(existing ? existing.items.map(config.toRow) : [config.emptyRow()])
    setErrors({})
  }
  const openAdd = () => {
    if (!grid.cells) return setNotice(grid.conditionMessage)
    setName("")
    setRows([])
    setErrors({})
    setModal(true)
  }
  const openGroup = (group: G) => {
    fill(nameOf(group))
    setModal(true)
  }
  const setField = (index: number, key: string, value: string, resets: string[] = []) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...Object.fromEntries(resets.map((r) => [r, ""])), [key]: value } : row)))

  const submit = async () => {
    if (!arrival) return
    const nextErrors: Record<string, string> = {}
    rows.forEach((row, i) => {
      config.fields.forEach((field) => {
        const value = row[field.key] ?? ""
        if (!value.trim()) nextErrors[`${i}.${field.key}`] = "Обязательное поле"
        else if (field.kind === "number" && !isNumber(value)) nextErrors[`${i}.${field.key}`] = "Только числа"
      })
      if (!row.time_start) nextErrors[`${i}.time_start`] = "Обязательное поле"
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    if (!name && rows.length) return setNotice("Выберите наименование")

    const items = rows.map((row) => {
      const showEnd = config.showTimeEnd?.(row) ?? true
      const times: TimeInterval = {
        time_start: resolveTime(row.time_start, arrival)!,
        time_end: showEnd && row.time_end ? resolveTime(row.time_end, arrival) : null,
      }
      return { item: config.toItem(row, times), ongoing: config.isOngoing?.(row) ?? false }
    })
    if (hasOverlaps(items.map(({ item, ongoing }) => ({ ...item, ongoing })))) return setNotice("Введены пересекающиеся интервалы!")
    if (items.some(({ item }) => item.time_end && dayjs(item.time_end).isBefore(item.time_start))) return setNotice("Указан некорректный интервал введения")

    const existing = groups.find((g) => nameOf(g) === name)
    const updated = { [config.nameField]: name, items: items.map(({ item }) => item) } as unknown as G
    let next: G[]
    if (existing) next = items.length ? groups.map((g) => (g === existing ? updated : g)) : groups.filter((g) => g !== existing)
    else next = items.length ? [...groups, updated] : groups
    if (next === groups) return setModal(false)
    await onSave(next)
    setModal(false)
  }

  const error = (i: number, key: string) => errors[`${i}.${key}`]

  return (
    <>
      <GridTables
        grid={grid}
        corner={config.corner}
        totalTitle={config.totalTitle}
        onUndefinedCell={() => setNotice(grid.conditionMessage)}
        addRow={{ label: config.addLabel, onAdd: openAdd, testId }}
        rows={groups.map((group) => ({
          key: nameOf(group),
          label: nameOf(group),
          cell: (cell) => {
            const mark = config.mark(group, cell, grid.interval)
            if (!mark) return "-"
            const svg = mark.kind === "bolus" ? icons.bolus : mark.kind === "stop" ? icons.infusionStop : icons.infusionStart
            return <CellIcon svg={svg} title={mark.title} />
          },
          cellProps: () => ({ className: "clickable", onClick: () => openGroup(group) }),
          total: config.total?.(group),
          totalBlocked: !config.total,
        }))}
      />

      <Modal open={modal} title={config.modalTitle} size="xl" onClose={() => setModal(false)}
             footer={<AnesButton disabled={saving} onClick={submit}>Добавить</AnesButton>}>
        <div className="anes-card">
          <div className="mb-5 flex items-center gap-5">
            {config.names === "medicaments" ? (
              <MedicamentSearch value={name} onSelect={fill} />
            ) : (
              <AnesSelect className="w-full" aria-label="Наименование" options={config.names.map((n) => ({ value: n, label: n }))}
                          value={name} onChange={(e) => fill(e.target.value)} />
            )}
            <button type="button" className="anes-icon-btn" title="Добавить интервал" aria-label="Добавить интервал"
                    onClick={() => name && setRows([...rows, config.emptyRow()])}>
              <Svg src={icons.add} />
            </button>
          </div>
          {rows.map((row, index) => {
            const showEnd = config.showTimeEnd?.(row) ?? true
            return (
              <div key={index} className="anes-modal-block" style={{ gridTemplateColumns: config.columns }} data-testid="interval-row">
                {config.fields.map((field) =>
                  field.kind === "select" ? (
                    <AnesSelect key={field.key} label={field.label} options={field.options?.(row, name) ?? []} value={row[field.key] ?? ""}
                                error={error(index, field.key)} onChange={(e) => setField(index, field.key, e.target.value, field.resets)} />
                  ) : (
                    <AnesInput key={field.key} label={field.label} placeholder="Введите" maxLength={255} adornment={field.adornment}
                               inputMode={field.kind === "number" ? "decimal" : undefined}
                               value={row[field.key] ?? ""} error={error(index, field.key)} onChange={(e) => setField(index, field.key, e.target.value)} />
                  ),
                )}
                <AnesInput type="time" label={config.timeStartLabel?.(row) ?? "Время начала:"} value={row.time_start ?? ""}
                           error={error(index, "time_start")} onChange={(e) => setField(index, "time_start", e.target.value)} />
                {showEnd ? (
                  <AnesInput type="time" label="Время завершения:" value={row.time_end ?? ""} onChange={(e) => setField(index, "time_end", e.target.value)} />
                ) : <div />}
                <button type="button" className="anes-icon-btn mt-6" title="Удалить интервал" aria-label="Удалить интервал"
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                  <Svg src={icons.close} />
                </button>
              </div>
            )
          })}
        </div>
      </Modal>
      <NoticeModal message={notice} onClose={() => setNotice(null)} />
    </>
  )
}

export const timeRow = (item: TimeInterval) => ({ time_start: hhmm(item.time_start), time_end: hhmm(item.time_end) })
