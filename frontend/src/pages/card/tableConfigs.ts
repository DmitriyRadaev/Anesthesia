import type { DrugGroup, DrugSection, InfusionGroup, InjectionType, LiquidGroup, TransfusionGroup } from "../../api/types"
import { drugMark, drugTotal, LIQUID_OPTIONS, spanMark, SPECIAL_UNIT_DRUGS, sumOf } from "./cardLogic"
import { timeRow, type GroupTableConfig } from "./GroupTable"

type Unit = { id: number; name: string }

const MODAL_TITLES: Record<DrugSection, string> = {
  premedication: "Выбор препарата для премедикации",
  introduction: "Выбор препарата для введения в анестезию",
  maintenance: "Выбор препарата для поддержания анестезии",
}

/** Единицы для препарата: особые препараты — только своя единица, прочие — без «Ед» и «ME» (как в исходной системе). */
const unitsFor = (units: Unit[], drug: string) => {
  const special = SPECIAL_UNIT_DRUGS[drug]
  const allowed = special ? units.filter((u) => u.name === special) : units.filter((u) => u.id !== 5 && u.id !== 6)
  return allowed.map((u) => ({ value: u.id, label: u.name }))
}

export function drugConfig(section: DrugSection, units: Unit[]): GroupTableConfig<DrugGroup> {
  const unitName = (id: number) => units.find((u) => u.id === id)?.name ?? ""
  return {
    corner: "Препарат \\ Время",
    addLabel: "Добавить препарат",
    modalTitle: MODAL_TITLES[section],
    totalTitle: "Итого",
    nameField: "drug",
    names: "medicaments",
    columns: "4fr 4fr 4fr 4fr 4fr 1fr",
    fields: [
      { key: "injection_type", label: "Тип введения:", kind: "select", options: () => [{ value: "BOLUS", label: "Болюсное" }, { value: "INFUSION", label: "Инфузионное" }] },
      { key: "dose", label: "Дозировка:", kind: "number" },
      { key: "measurement_unit", label: "Ед.изм.:", kind: "select", options: (_, drug) => unitsFor(units, drug) },
    ],
    timeStartLabel: (row) => (row.injection_type === "BOLUS" ? "Время введения:" : "Время начала:"),
    showTimeEnd: (row) => row.injection_type === "INFUSION",
    isOngoing: (row) => row.injection_type === "INFUSION" && !row.time_end,
    emptyRow: () => ({ injection_type: "", dose: "", measurement_unit: "", time_start: "", time_end: "" }),
    toRow: (item) => ({
      injection_type: String(item.injection_type), dose: String(item.dose), measurement_unit: String(item.measurement_unit), ...timeRow(item),
    }),
    toItem: (row, times) => ({
      injection_type: row.injection_type as InjectionType, dose: row.dose.replace(",", "."), measurement_unit: Number(row.measurement_unit), ...times,
    }),
    mark: (group, cell, interval) => drugMark(group, cell, interval),
    total: (group) => drugTotal(group, unitName),
  }
}

export const infusionConfig: GroupTableConfig<InfusionGroup> = {
  corner: "Препарат \\ Время",
  addLabel: "Добавить препарат",
  modalTitle: "Выбор препарата для инфузионной терапии",
  totalTitle: "Итого",
  nameField: "solution",
  names: "medicaments",
  columns: "3fr 3fr 3fr 1fr",
  fields: [{ key: "dose", label: "Дозировка:", kind: "number", adornment: "ml" }],
  emptyRow: () => ({ dose: "", time_start: "", time_end: "" }),
  toRow: (item) => ({ dose: String(item.dose), ...timeRow(item) }),
  toItem: (row, times) => ({ dose: row.dose.replace(",", "."), ...times }),
  mark: (group, cell, interval) => spanMark(group.items.map((i) => ({ ...i, title: i.dose })), cell, interval),
  total: (group) => String(sumOf(group.items.map((i) => i.dose))),
}

export const transfusionConfig: GroupTableConfig<TransfusionGroup> = {
  corner: "Препарат \\ Время",
  addLabel: "Добавить препарат",
  modalTitle: "Выбор препарата для трансфузионной терапии",
  nameField: "solution",
  names: "medicaments",
  columns: "3fr 3fr 3fr 1fr",
  fields: [{ key: "gemakon", label: "Данные гемакона:", kind: "text" }],
  emptyRow: () => ({ gemakon: "", time_start: "", time_end: "" }),
  toRow: (item) => ({ gemakon: String(item.gemakon), ...timeRow(item) }),
  toItem: (row, times) => ({ gemakon: row.gemakon, ...times }),
  mark: (group, cell, interval) => spanMark(group.items.map((i) => ({ ...i, title: i.gemakon })), cell, interval),
}

export const liquidConfig: GroupTableConfig<LiquidGroup> = {
  corner: "Потери \\ Время",
  addLabel: "Добавить потери",
  modalTitle: "Жидкостные потери",
  totalTitle: "Итого",
  nameField: "liquid",
  names: LIQUID_OPTIONS,
  columns: "3fr 3fr 3fr 1fr",
  fields: [{ key: "volume", label: "Объем:", kind: "number", adornment: "ml" }],
  emptyRow: () => ({ volume: "", time_start: "", time_end: "" }),
  toRow: (item) => ({ volume: String(item.volume), ...timeRow(item) }),
  toItem: (row, times) => ({ volume: row.volume.replace(",", "."), ...times }),
  mark: (group, cell, interval) => spanMark(group.items.map((i) => ({ ...i, title: i.volume })), cell, interval),
  total: (group) => String(sumOf(group.items.map((i) => i.volume))),
}
