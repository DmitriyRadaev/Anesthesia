import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import dayjs from "dayjs"
import { describe, expect, it } from "vitest"
import type { AnestheticAction, CardPatientInfo, DrugGroup } from "../api/types"
import {
  drugMark,
  drugTotal,
  emptyStages,
  generateCells,
  generationCondition,
  validateAddAction,
  validateAddBreath,
  validateAddStage,
  validateDeleteAction,
  type CardSnapshot,
} from "../pages/card/cardLogic"
import { makeUser, mockApi, page, renderApp } from "./utils"

const arrival = dayjs("2026-10-20T09:00:00")
const at = (hhmm: string) => dayjs(`2026-10-20T${hhmm}:00`)
const iso = (hhmm: string) => at(hhmm).format()

function snapshot(overrides: Partial<CardSnapshot> = {}): CardSnapshot {
  return {
    arrival, actions: [], breath: { spontaneous: [], supportive: [], forced: [] }, stages: emptyStages(),
    drugs: { premedication: [], introduction: [], maintenance: [] }, infusions: [], transfusions: [], liquids: [], ...overrides,
  }
}
const action = (value: AnestheticAction["value"], hhmm: string): AnestheticAction => ({ value, time: iso(hhmm) })

describe("наркозная карта: генерация ячеек времени", () => {
  it("строит ячейки от поступления до окончания анестезии с выбранным интервалом", () => {
    expect(generateCells(arrival, 5, at("09:32")).map((c) => c.format("HH:mm"))).toEqual(["09:00", "09:05", "09:10", "09:15", "09:20", "09:25", "09:30"])
    expect(generateCells(arrival, 15, at("09:32")).map((c) => c.format("HH:mm"))).toEqual(["09:00", "09:15", "09:30"])
  })

  it("без окончания анестезии растёт до текущего момента, но не более суток", () => {
    expect(generateCells(arrival, 5, null, at("09:12"))).toHaveLength(3)
    expect(generateCells(arrival, 5, null, arrival.add(3, "day"))).toHaveLength(Math.floor(1439 / 5) + 1)
  })

  it("сообщает, чего не хватает для построения шкалы", () => {
    expect(generationCondition("", "").message).toBe("Не указаны дата операции и время поступления!")
    expect(generationCondition("2026-10-20", "").message).toBe("Не указано время поступления!")
    expect(generationCondition("", "09:00").message).toBe("Не указана дата операции!")
    expect(generationCondition("2026-10-20", "09:00").ok).toBe(true)
  })
})

describe("наркозная карта: правила установки пиктограмм", () => {
  it("требует начала анестезии, но допускает премедикацию до него", () => {
    expect(validateAddAction(snapshot(), "INTUBATION", at("09:10"), 5)).toBe("Сначала установите начало анестезии")
    expect(validateAddAction(snapshot(), "PREMEDICATION", at("09:05"), 5)).toBeNull()
    const card = snapshot({ actions: [action("ANESTHESIA_START", "09:10")] })
    expect(validateAddAction(card, "TURN", at("09:05"), 5)).toBe("Недопустимо добавление пиктограммы Поворот ранее начала анестезии")
    expect(validateAddAction(card, "ANESTHESIA_START", at("09:20"), 5)).toBe("Пиктограмма Начало анестезии уже добавлена!")
    expect(validateAddAction(card, "TURN", at("09:10"), 5)).toBe("На выбранное время уже добавлена пиктограмма Начало анестезии")
  })

  it("соблюдает порядок интубация → экстубация", () => {
    const card = snapshot({ actions: [action("ANESTHESIA_START", "09:00")] })
    expect(validateAddAction(card, "EXTUBATION", at("09:20"), 5)).toBe("Неверный порядок действий интубация и экстубация")
    const intubated = snapshot({ actions: [action("ANESTHESIA_START", "09:00"), action("INTUBATION", "09:10")] })
    expect(validateAddAction(intubated, "EXTUBATION", at("09:30"), 5)).toBeNull()
    expect(validateAddAction(intubated, "INTUBATION", at("09:30"), 5)).toBe("Неверный порядок действий интубация и экстубация")
  })

  it("не даёт завершить анестезию раньше введённых данных", () => {
    const card = snapshot({
      actions: [action("ANESTHESIA_START", "09:00")],
      breath: { spontaneous: [], supportive: [], forced: [{ time_start: iso("09:05"), time_end: iso("09:40") }] },
    })
    expect(validateAddAction(card, "ANESTHESIA_STOP", at("09:30"), 5)).toMatch(/таблице характеристика дыхания/)
    const withDrug = snapshot({
      actions: [action("ANESTHESIA_START", "09:00")],
      drugs: { premedication: [], introduction: [], maintenance: [{ drug: "Пропофол", items: [
        { injection_type: "BOLUS", measurement_unit: 1, dose: "50", time_start: iso("09:45"), time_end: null }] }] },
    })
    expect(validateAddAction(withDrug, "ANESTHESIA_STOP", at("09:30"), 5)).toMatch(/таблице поддержание анестезии/)
  })

  it("запрещает удалять начало анестезии, если после него есть пиктограммы", () => {
    const actions = [action("ANESTHESIA_START", "09:00"), action("TURN", "09:20")]
    expect(validateDeleteAction(actions, actions[0])).toBe("Есть иконки после отмененного креста")
  })

  it("проверяет последовательность этапов операции", () => {
    const card = snapshot({ actions: [action("ANESTHESIA_START", "09:10")] })
    expect(validateAddStage(card, 2, at("09:30"))).toBe("Внимание! Сначала укажите I этап")
    expect(validateAddStage(card, 1, at("09:05"))).toBe("Внимание! Измените время начала анестезии")
    expect(validateAddStage(card, 1, at("09:15"))).toBeNull()
    const staged = snapshot({ ...card, stages: emptyStages().map((s) => (s.stage === 1 ? { ...s, time_start: iso("09:15") } : s)) })
    expect(validateAddStage(staged, 2, at("09:15"))).toBe("Внимание! Время начала I этапа не корректно")
  })

  it("не допускает пересечения интервалов дыхания", () => {
    const breath = { spontaneous: [{ time_start: iso("09:00"), time_end: iso("09:20") }], supportive: [], forced: [] }
    expect(validateAddBreath(breath, "forced", at("09:10"), at("09:30"))).toBe("Введены пересекающиеся интервалы")
    expect(validateAddBreath(breath, "forced", at("09:20"), at("09:30"))).toBeNull()
    expect(validateAddBreath(breath, "forced", at("09:30"), at("09:25"))).toBe("Указан некорректный интервал введения")
  })
})

describe("наркозная карта: ячейки и итог по препаратам", () => {
  const group: DrugGroup = {
    drug: "Фентанил",
    items: [
      { injection_type: "BOLUS", measurement_unit: 2, dose: "100", time_start: iso("09:05"), time_end: null },
      { injection_type: "BOLUS", measurement_unit: 1, dose: "0,1", time_start: iso("09:07"), time_end: null },
      { injection_type: "INFUSION", measurement_unit: 1, dose: "2", time_start: iso("09:20"), time_end: iso("09:35") },
    ],
  }

  it("суммирует болюсы в ячейке и показывает начало и окончание инфузии", () => {
    expect(drugMark(group, at("09:05"), 5)).toEqual({ kind: "bolus", title: "100.1" })
    expect(drugMark(group, at("09:25"), 5)).toEqual({ kind: "start", title: "2" })
    expect(drugMark(group, at("09:35"), 5)).toEqual({ kind: "stop", title: "2" })
    expect(drugMark(group, at("09:40"), 5)).toBeNull()
  })

  it("приводит массовые единицы к mg", () => {
    expect(drugTotal(group, () => "")).toBe("2.2 mg")
  })
})

// --- страница карты целиком -------------------------------------------------------------------------------

const doctor = makeUser({ id: 7 })
const info: CardPatientInfo = {
  id: 5, surname: "Сидоров", firstname: "Алексей", lastname: "Петрович", birthdate: "1968-11-23", sex: 1, blood_group: 1, blood_rh: 2,
  status: 1 as CardPatientInfo["status"], operation_date: "2026-10-20", operation_time: "09:00:00", pid: "P-1", operation_code: "",
  asa: 1, volume_operation: 1, department: 1, drug_intolerance: "", type_operation: 1, ventilator: 1, monitoring: 1,
  operation_name: "Грыжесечение", diagnosis_name: "", height: "176", weight: "82", bmi: 26.5,
}

const emptyPoint = Object.fromEntries(
  ["TEMP", "BIS", "O2", "AIR", "SpO2", "CO2", "N2O", "RESP_RATE", "HEART_RATE", "PULS", "SEVOFL", "DESFL", "ISOFL", "PRESS_BLD_VEN_CENT",
    "PRESS_BLD", "PRESS_BLD_ART", "PRESS_BLD_ART_ABP", "PRESS_BLD_NONINV", "PRESS_BLD_ART_FEMORAL", "PRESS_BLD_ART_BRACHIAL"].map((k) => [k, null]),
)
// ключи ЦМС — концы 5-минутных интервалов от поступления (ISO со смещением)
const cmsData = {
  [iso("09:05")]: { ...emptyPoint, HEART_RATE: "72", SEVOFL: "1.8", PRESS_BLD_NONINV: { SYS: "120", MEAN: "93", DIA: "80" } },
}

function cardApiMock(overrides: Partial<CardPatientInfo> = {}) {
  return mockApi((url, init) => {
    const path = url.pathname
    if (path === "/api/auth/me/") return { body: doctor }
    if (path.startsWith("/api/catalogs/measurement_units")) return { body: [{ id: 1, name: "mg" }, { id: 2, name: "mcg" }, { id: 5, name: "Ед" }] }
    if (path.startsWith("/api/catalogs/")) return { body: [{ id: 1, name: "Вариант 1" }, { id: 2, name: "Вариант 2" }] }
    if (path === "/api/medicaments/") return { body: page([{ id: 3, name: "Мидазолам", group: 1, group_name: "Бензодиазепины" }]) }
    if (!path.startsWith("/api/operations/5/card/")) return undefined
    const block = path.replace("/api/operations/5/card/", "").replace(/\/$/, "")
    if (init.method !== "GET") return { body: JSON.parse(String(init.body)) }
    if (block === "patient-info") return { body: { ...info, ...overrides } }
    if (block === "breath") return { body: { spontaneous: [], supportive: [], forced: [] } }
    if (block === "stages") return { body: emptyStages() }
    if (block === "cms") return { body: { time_start: null, time_end: null, pid: "P-1", data: cmsData } }
    return { body: [] }
  })
}

describe("страница наркозной карты", () => {
  it("ставит пиктограмму двойным щелчком и сохраняет действия кнопкой «Сохранить»", async () => {
    const { calls } = cardApiMock()
    renderApp("/operations/5/card", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Инфографика" }))
    await userEvent.click(screen.getByRole("button", { name: "Начало анестезии" }))
    await userEvent.dblClick(screen.getByTestId("actions-09:05"))
    expect(screen.getByRole("button", { name: "Удалить Начало анестезии 09:05" })).toBeInTheDocument()
    // дата и время поступления блокируются после установки пиктограмм
    expect(screen.getByTestId("timeArrival")).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path.endsWith("/card/actions/"))).toBe(true))
    const saved = calls.find((c) => c.method === "PUT" && c.path.endsWith("/card/actions/"))!.body as AnestheticAction[]
    expect(saved).toHaveLength(1)
    expect(saved[0].value).toBe("ANESTHESIA_START")
    expect(dayjs(saved[0].time).format("YYYY-MM-DD HH:mm")).toBe("2026-10-20 09:05")
    expect(await screen.findByText("Наркозная карта сохранена")).toBeInTheDocument()
  })

  it("предупреждает о нарушении правил установки", async () => {
    cardApiMock()
    renderApp("/operations/5/card", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Инфографика" }))
    await userEvent.click(screen.getByRole("button", { name: "Интубация трахеи" }))
    await userEvent.dblClick(screen.getByTestId("actions-09:10"))
    expect(await screen.findByText("Сначала установите начало анестезии")).toBeInTheDocument()
  })

  it("показывает данные мониторов в ячейках ЦМС и медицинских газов", async () => {
    cardApiMock()
    renderApp("/operations/5/card", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "ЦМС" }))
    expect(await screen.findByText("72")).toBeInTheDocument()
    expect(screen.getByText(/120\s+93\s+80/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Медицинские газы" }))
    expect(screen.getByText("1.8")).toBeInTheDocument()
  })

  it("не сохраняет карту с незаполненными обязательными полями", async () => {
    const { calls } = cardApiMock({ asa: null })
    renderApp("/operations/5/card", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Сохранить" }))
    expect(await screen.findByText("Проверьте правильность заполнения полей")).toBeInTheDocument()
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0)
  })

  it("добавляет препарат премедикации через модальное окно и сразу сохраняет таблицу", async () => {
    const { calls } = cardApiMock()
    renderApp("/operations/5/card", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Премедикация" }))
    await userEvent.click(screen.getByRole("button", { name: "Добавить препарат" }))
    const dialog = await screen.findByRole("dialog", { name: "Выбор препарата для премедикации" })
    await userEvent.type(within(dialog).getByRole("combobox", { name: "Препарат" }), "Мида")
    await userEvent.click(await within(dialog).findByRole("option", { name: "Мидазолам" }))
    const row = within(dialog).getByTestId("interval-row")
    await userEvent.selectOptions(within(row).getByLabelText("Тип введения:"), "BOLUS")
    await userEvent.type(within(row).getByLabelText("Дозировка:"), "5")
    await userEvent.selectOptions(within(row).getByLabelText("Ед.изм.:"), "1")
    expect(within(row).queryByRole("option", { name: "Ед" })).not.toBeInTheDocument()
    fireEvent.change(within(row).getByLabelText("Время введения:"), { target: { value: "08:30" } }) // раньше поступления → следующие сутки
    await userEvent.click(within(dialog).getByRole("button", { name: "Добавить" }))

    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path.endsWith("/drugs/premedication/"))).toBe(true))
    const [group] = calls.find((c) => c.method === "PUT" && c.path.endsWith("/drugs/premedication/"))!.body as DrugGroup[]
    expect(group.drug).toBe("Мидазолам")
    expect(group.items[0]).toMatchObject({ injection_type: "BOLUS", dose: "5", measurement_unit: 1, time_end: null })
    expect(dayjs(group.items[0].time_start).format("YYYY-MM-DD HH:mm")).toBe("2026-10-21 08:30")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})

describe("защита несохранённых изменений", () => {
  it("переход по ссылке с несохранёнными изменениями требует подтверждения", async () => {
    cardApiMock()
    renderApp("/operations/5/card", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Инфографика" }))
    await userEvent.click(screen.getByRole("button", { name: "Начало анестезии" }))
    await userEvent.dblClick(screen.getByTestId("actions-09:05"))
    await userEvent.click(screen.getByRole("link", { name: "Протокол анестезии" }))
    const dialog = await screen.findByRole("dialog", { name: "Сохранение" })
    await userEvent.click(within(dialog).getByRole("button", { name: "Остаться на странице" }))
    expect(screen.getByRole("heading", { name: "Наркозная карта" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("link", { name: "Протокол анестезии" }))
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Сохранение" })).getByRole("button", { name: "Перейти без сохранения" }))
    expect(await screen.findByRole("heading", { name: "Протокол анестезии" })).toBeInTheDocument()
  })
})
