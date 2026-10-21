import dayjs, { type Dayjs } from "dayjs"
import type {
  ActionValue,
  AnestheticAction,
  BreathCharacteristics,
  BreathType,
  DrugGroup,
  DrugSection,
  InfusionGroup,
  LiquidGroup,
  OperationStage,
  TimeInterval,
  TransfusionGroup,
} from "../../api/types"
import { actionOption } from "./pictograms"

/**
 * Логика наркозной карты, перенесённая из исходной системы (CellsGenerator.store.ts и связанные функции).
 * Функции чистые: возвращают текст предупреждения или null — интерфейс показывает текст пользователю.
 */

export const INTERVALS = [5, 10, 15] as const
/** Карта охватывает не более суток: 1439 минут от времени поступления. */
const MINUTES_UNTIL_DAY_SHIFT = 1439

export const NO_ARRIVAL_MESSAGE = "Не указаны дата операции и время поступления!"

export function generationCondition(date: string, time: string): { ok: boolean; message: string } {
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date).isValid()
  const timeOk = /^\d{2}:\d{2}$/.test(time)
  if (!dateOk && !timeOk) return { ok: false, message: NO_ARRIVAL_MESSAGE }
  if (!dateOk) return { ok: false, message: "Не указана дата операции!" }
  if (!timeOk) return { ok: false, message: "Не указано время поступления!" }
  return { ok: true, message: "" }
}

/** Временные ячейки: от времени поступления с шагом `interval` до окончания анестезии (или текущего момента). */
export function generateCells(arrival: Dayjs, interval: number, anesthesiaStop: Dayjs | null, now: Dayjs = dayjs()): Dayjs[] {
  let delta: number
  if (anesthesiaStop) {
    delta = Math.round(anesthesiaStop.diff(arrival, "minute", true))
  } else {
    delta = Math.min(now.diff(arrival, "minute"), MINUTES_UNTIL_DAY_SHIFT)
  }
  const cells = [arrival]
  for (let i = 1; i <= delta / interval; i += 1) cells.push(arrival.add(i * interval, "minute"))
  return cells
}

/** Ячейка, в интервал которой попадает момент времени [cell, cell + interval). */
export function inCell(time: Dayjs | string | null | undefined, cell: Dayjs, interval: number): boolean {
  if (!time) return false
  const moment = dayjs(time)
  return !moment.isBefore(cell) && moment.isBefore(cell.add(interval, "minute"))
}

export const sameCell = (a: Dayjs | string, b: Dayjs | string, interval: number, cells: Dayjs[]) =>
  cells.some((cell) => inCell(a, cell, interval) && inCell(b, cell, interval))

/** Время ЧЧ:ММ из модального окна → момент времени; время раньше поступления относится к следующим суткам. */
export function resolveTime(hhmm: string, arrival: Dayjs): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null
  const [hours, minutes] = hhmm.split(":").map(Number)
  let candidate = arrival.hour(hours).minute(minutes).second(0).millisecond(0)
  if (candidate.isBefore(arrival.subtract(1, "minute"))) candidate = candidate.add(1, "day")
  return candidate.format()
}

export const hhmm = (time: string | Dayjs | null | undefined) => (time ? dayjs(time).format("HH:mm") : "")

// --- снимок карты, нужный для проверок ----------------------------------------------------------

export interface CardSnapshot {
  arrival: Dayjs
  actions: AnestheticAction[]
  breath: BreathCharacteristics
  stages: OperationStage[]
  drugs: Record<DrugSection, DrugGroup[]>
  infusions: InfusionGroup[]
  transfusions: TransfusionGroup[]
  liquids: LiquidGroup[]
}

const DRUG_TABLE_TITLES: Record<DrugSection, string> = {
  premedication: "премедикация",
  introduction: "введение в анестезию",
  maintenance: "поддержание анестезии",
}

const describe = (value: ActionValue) => actionOption(value)?.description ?? value
const findAction = (actions: AnestheticAction[], value: ActionValue) => actions.find((a) => a.value === value)
const latest = (times: Array<string | null | undefined>, from: Dayjs): Dayjs =>
  times.reduce<Dayjs>((acc, t) => (t && dayjs(t).isAfter(acc) ? dayjs(t) : acc), from)
const notAfter = (last: Dayjs, picked: Dayjs) => last.isBefore(picked.add(1, "minute"))

function tubeOrderOk(actions: AnestheticAction[], value: ActionValue, picked: Dayjs): boolean {
  const lastOf = (v: ActionValue) => actions.filter((a) => a.value === v).sort((a, b) => a.time.localeCompare(b.time)).at(-1) ?? null
  const lastIntubation = lastOf("INTUBATION")
  const lastExtubation = lastOf("EXTUBATION")
  if (value === "EXTUBATION") {
    return (
      lastIntubation !== null &&
      picked.isAfter(lastIntubation.time) &&
      (lastExtubation === null || dayjs(lastIntubation.time).isAfter(lastExtubation.time))
    )
  }
  if (value === "INTUBATION") {
    if (lastIntubation === null && lastExtubation === null) return true
    return lastExtubation !== null && picked.isAfter(lastExtubation.time) && (lastIntubation === null || dayjs(lastExtubation.time).isAfter(lastIntubation.time))
  }
  return true
}

/** Проверки установки пиктограммы анестезиологического действия в ячейку (порядок — как в исходной системе). */
export function validateAddAction(card: CardSnapshot, value: ActionValue, picked: Dayjs, interval: number): string | null {
  const existing = card.actions.find((a) => inCell(a.time, picked, interval))
  if (existing) return `На выбранное время уже добавлена пиктограмма ${describe(existing.value)}`

  const description = describe(value)
  if (["ANESTHESIA_START", "ANESTHESIA_STOP", "PREMEDICATION", "INTRODUCTION"].includes(value) && findAction(card.actions, value)) {
    return `Пиктограмма ${description} уже добавлена!`
  }
  const start = findAction(card.actions, "ANESTHESIA_START")
  if (!start && value !== "ANESTHESIA_START" && value !== "PREMEDICATION") return "Сначала установите начало анестезии"
  if (start && picked.isBefore(start.time) && value !== "PREMEDICATION") {
    return `Недопустимо добавление пиктограммы ${description} ранее начала анестезии`
  }
  if (!tubeOrderOk(card.actions, value, picked)) return "Неверный порядок действий интубация и экстубация"

  if (value === "ANESTHESIA_STOP") {
    const breathEnds = Object.values(card.breath).flat().map((i) => i.time_end)
    if (!notAfter(latest(breathEnds, card.arrival), picked)) {
      return "Время завершения анестезии меньше времени указанном в таблице характеристика дыхания последней введенной характеристики"
    }
    if (card.stages.some((s) => s.time_start && !dayjs(s.time_start).subtract(1, "minute").isBefore(picked))) {
      return "Время завершения анестезии меньше времени указанном в таблице этапы операции последнего добавленного этапа"
    }
    if (!notAfter(latest(card.actions.map((a) => a.time), card.arrival), picked)) {
      return "Время завершения анестезии меньше времени указанном в таблице анестезиологические действия последнего добавленного действия"
    }
    if (!notAfter(latest(card.liquids.flatMap((g) => g.items.map((i) => i.time_end)), card.arrival), picked)) {
      return "Внимание! Время завершения анестезии меньше времени указанном в таблице жидкостные потери последней введенной потери"
    }
    const solutionTables: Array<[string, TimeInterval[]]> = [
      ["инфузионная терапия", card.infusions.flatMap((g) => g.items)],
      ["трансфузионная терапия", card.transfusions.flatMap((g) => g.items)],
    ]
    for (const [title, items] of solutionTables) {
      if (!notAfter(latest(items.map((i) => i.time_end), card.arrival), picked)) {
        return `Внимание! Время завершения анестезии меньше времени указанном в таблице ${title} последнего введенного препарата`
      }
    }
    for (const section of ["premedication", "introduction", "maintenance"] as DrugSection[]) {
      const times = card.drugs[section].flatMap((g) => g.items.map((i) => (i.injection_type === "BOLUS" ? i.time_start : i.time_end)))
      if (!notAfter(latest(times, card.arrival), picked)) {
        return `Внимание! Время завершения анестезии меньше времени указанном в таблице ${DRUG_TABLE_TITLES[section]} последнего введенного препарата`
      }
    }
  }

  if (value === "ANESTHESIA_START") {
    const first = card.stages.find((s) => s.stage === 1)?.time_start
    if (first && dayjs(first).isBefore(picked)) return "Время начала анестезии должно быть ранее времени начала операции"
  }
  return null
}

export function validateDeleteAction(actions: AnestheticAction[], target: AnestheticAction): string | null {
  if (target.value === "ANESTHESIA_START") {
    if (actions.some((a) => dayjs(a.time).isAfter(target.time) && a.value !== "PREMEDICATION")) return "Есть иконки после отмененного креста"
  }
  const lastOf = (v: ActionValue) => actions.filter((a) => a.value === v).sort((a, b) => a.time.localeCompare(b.time)).at(-1)
  if (target.value === "EXTUBATION") {
    const lastIntubation = lastOf("INTUBATION")
    if (lastIntubation && dayjs(lastIntubation.time).isAfter(target.time)) return "Неверный порядок действий интубация и экстубация"
  }
  if (target.value === "INTUBATION") {
    const lastExtubation = lastOf("EXTUBATION")
    if (lastExtubation && dayjs(lastExtubation.time).isAfter(target.time)) return "Неверный порядок действий интубация и экстубация"
  }
  return null
}

// --- этапы операции ------------------------------------------------------------------------------

export const ROMAN = ["I", "II", "III", "IV", "V", "VI"]
export const DEFAULT_STAGE_DESCRIPTIONS: Record<number, string> = { 1: "Разрез", 6: "Окончание. Ушивание раны" }

export const emptyStages = (): OperationStage[] =>
  [1, 2, 3, 4, 5, 6].map((stage) => ({ stage, time_start: null, description: DEFAULT_STAGE_DESCRIPTIONS[stage] ?? "" }))

/** Проверка установки этапа: последовательность I → VI, I этап обязателен первым, не раньше начала анестезии. */
export function validateAddStage(card: CardSnapshot, stage: number, time: Dayjs): string | null {
  const times = emptyStages().map((s) => {
    if (s.stage === stage) return time
    const existing = card.stages.find((x) => x.stage === s.stage)?.time_start
    return existing ? dayjs(existing) : null
  })
  if (times.slice(1).some(Boolean) && times[0] === null) return "Внимание! Сначала укажите I этап"
  for (let i = 4; i >= 0; i -= 1) {
    const current = times[i]
    if (current && times.slice(i + 1).some((later) => later !== null && !current.isBefore(later))) {
      return `Внимание! Время начала ${ROMAN[i]} этапа не корректно`
    }
  }
  const start = findAction(card.actions, "ANESTHESIA_START")
  if (!start) return "Внимание! Измените время начала анестезии"
  if (times[0] && !times[0].add(1, "minute").isAfter(start.time)) return "Внимание! Измените время начала анестезии"
  return null
}

export function validateDeleteStage(stages: OperationStage[], stage: number): string | null {
  if (stage === 1 && stages.some((s) => s.stage !== 1 && s.time_start)) return "Внимание! Время начала I этапа не корректно"
  return null
}

// --- характеристика дыхания ------------------------------------------------------------------------

export function validateAddBreath(breath: BreathCharacteristics, type: BreathType, start: Dayjs, end: Dayjs): string | null {
  if (!start.isBefore(end)) return "Указан некорректный интервал введения"
  const strictlyInside = (t: Dayjs | string, a: string, b: string | null) => b !== null && dayjs(t).isAfter(a) && dayjs(t).isBefore(b)
  for (const [kind, intervals] of Object.entries(breath) as Array<[BreathType, TimeInterval[]]>) {
    for (const i of intervals) {
      const overlaps =
        strictlyInside(start, i.time_start, i.time_end) ||
        strictlyInside(end, i.time_start, i.time_end) ||
        (dayjs(i.time_start).isAfter(start) && dayjs(i.time_start).isBefore(end)) ||
        (i.time_end !== null && dayjs(i.time_end).isAfter(start) && dayjs(i.time_end).isBefore(end))
      // интервалы одного типа не могут и соприкасаться (так их проверяет сервер)
      const touchesSameType = kind === type && i.time_end !== null && (dayjs(i.time_end).isSame(start) || dayjs(i.time_start).isSame(end))
      const identical = dayjs(i.time_start).isSame(start) && i.time_end !== null && dayjs(i.time_end).isSame(end)
      if (overlaps || touchesSameType || identical) return "Введены пересекающиеся интервалы"
    }
  }
  return null
}

// --- таблицы препаратов, растворов и потерь -----------------------------------------------------------

export type CellMark = { kind: "start" | "stop"; title: string } | { kind: "bolus"; title: string } | null

interface Span extends TimeInterval {
  title: string
}

/**
 * Отображение интервала в ячейках: «начало» во всех ячейках от начала до окончания (для продолжающегося — до текущего
 * момента), «окончание» — в ячейке времени окончания.
 */
export function spanMark(spans: Span[], cell: Dayjs, interval: number, now: Dayjs = dayjs()): CellMark {
  for (const span of spans) {
    if (span.time_end && inCell(span.time_end, cell, interval)) return { kind: "stop", title: span.title }
    if (inCell(span.time_start, cell, interval)) return { kind: "start", title: span.title }
    const end = span.time_end ? dayjs(span.time_end) : now
    if (cell.isAfter(span.time_start) && cell.isBefore(end)) return { kind: "start", title: span.title }
  }
  return null
}

const toNumber = (value: string | number) => Number(String(value).replace(",", "."))
const round = (value: number) => parseFloat(value.toFixed(10))

export function drugMark(group: DrugGroup, cell: Dayjs, interval: number, now: Dayjs = dayjs()): CellMark {
  const boluses = group.items.filter((i) => i.injection_type === "BOLUS" && inCell(i.time_start, cell, interval))
  if (boluses.length) return { kind: "bolus", title: String(round(boluses.reduce((sum, i) => sum + toNumber(i.dose), 0))) }
  const infusions = group.items.filter((i) => i.injection_type === "INFUSION").map((i) => ({ ...i, title: i.dose }))
  return spanMark(infusions, cell, interval, now)
}

/** Перевод в мг (как в исходной системе); единицы не массы суммируются как есть. */
const TO_MG: Record<number, number> = { 1: 1, 2: 0.001, 4: 0.000001 }

/** «Итого» по препарату: массовые единицы приводятся к mg, остальные суммируются в своей единице. */
export function drugTotal(group: DrugGroup, unitName: (id: number) => string): string {
  const units = new Set(group.items.map((i) => (TO_MG[i.measurement_unit] !== undefined ? "mg" : unitName(i.measurement_unit))))
  const sum = group.items.reduce((acc, i) => acc + toNumber(i.dose) * (TO_MG[i.measurement_unit] ?? 1), 0)
  if (units.size !== 1) {
    // смешение несопоставимых единиц: сумма по каждой отдельно
    const byUnit = new Map<string, number>()
    group.items.forEach((i) => {
      const unit = TO_MG[i.measurement_unit] !== undefined ? "mg" : unitName(i.measurement_unit)
      byUnit.set(unit, (byUnit.get(unit) ?? 0) + toNumber(i.dose) * (TO_MG[i.measurement_unit] ?? 1))
    })
    return [...byUnit].map(([unit, value]) => `${round(value)} ${unit}`).join("; ")
  }
  return `${round(sum)} ${[...units][0]}`
}

export const sumOf = (values: Array<string | number>) => round(values.reduce<number>((acc, v) => acc + toNumber(v), 0))

/** Пересечение интервалов одной группы (продолжающаяся инфузия считается бесконечной), с точностью до минуты. */
export function hasOverlaps(items: Array<TimeInterval & { ongoing?: boolean }>): boolean {
  const spans = items
    .map((i) => {
      const start = dayjs(i.time_start).startOf("minute")
      const end = i.time_end ? dayjs(i.time_end).startOf("minute") : i.ongoing ? start.add(10, "year") : start
      return [start, end] as const
    })
    .sort((a, b) => a[0].valueOf() - b[0].valueOf())
  return spans.some((span, index) => index > 0 && !span[0].isAfter(spans[index - 1][1]))
}

export const LIQUID_OPTIONS = ["Кровопотеря", "Диурез"]
/** Препараты с особыми единицами измерения (исходная система). */
export const SPECIAL_UNIT_DRUGS: Record<string, string> = { "Инсулин": "Ед", "Гепарин": "Ед", "Антитромбин III": "ME" }
