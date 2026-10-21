import dayjs from "dayjs"
import { describe, expect, it } from "vitest"
import { ApiError, buildQuery, flattenErrors } from "../api/client"
import { validateLabValue } from "../pages/LabPage"
import { validateOperation } from "../pages/OperationFormPage"
import { resolveTime } from "../pages/card/cardLogic"
import { paginate } from "../pages/card/CardPrintPage"
import { numberInRange, personName } from "../utils/validation"

describe("время наркозной карты", () => {
  const arrival = dayjs("2026-10-20T22:30:00")

  it("время после поступления относится к той же дате", () => {
    expect(dayjs(resolveTime("23:15", arrival)).format("YYYY-MM-DD HH:mm")).toBe("2026-10-20 23:15")
  })

  it("время раньше поступления относится к следующим суткам", () => {
    expect(dayjs(resolveTime("01:05", arrival)).format("YYYY-MM-DD HH:mm")).toBe("2026-10-21 01:05")
  })

  it("некорректное значение отклоняется", () => {
    expect(resolveTime("25", arrival)).toBeNull()
  })
})

describe("печатная форма наркозной карты", () => {
  it("делит ячейки на страницы по 30, последняя — 26 (место под «Итого»)", () => {
    expect(paginate(Array.from({ length: 20 }, (_, i) => i)).map((p) => [p.cells.length, p.last])).toEqual([[26, true]])
    const pages = paginate(Array.from({ length: 60 }, (_, i) => i))
    expect(pages.map((p) => p.cells.length)).toEqual([30, 30, 26])
    expect(pages[2].cells.filter((c) => c !== null)).toHaveLength(0)
    expect(paginate(Array.from({ length: 56 }, (_, i) => i))).toHaveLength(2)
  })
})

describe("API-клиент", () => {
  it("строит строку запроса, пропуская пустые значения", () => {
    expect(buildQuery({ a: 1, b: "", c: undefined, d: [1, 2], e: false })).toBe("?a=1&d=1&d=2&e=false")
    expect(buildQuery({})).toBe("")
  })

  it("разворачивает вложенные ошибки DRF", () => {
    const flat = flattenErrors({ items: [{ dose: ["Ошибка дозы"] }, {}], drug: ["Обязательное поле"] })
    expect(flat).toEqual({ "items.0.dose": ["Ошибка дозы"], drug: ["Обязательное поле"] })
    expect(new ApiError(400, "x", "invalid", flat).field("items.0.dose")).toBe("Ошибка дозы")
  })
})

describe("валидация", () => {
  it("ФИО и числовые диапазоны", () => {
    expect(personName("Иванов-Петров")).toBeUndefined()
    expect(personName("Ivanov1")).toBeDefined()
    expect(personName("", false)).toBeUndefined()
    expect(numberInRange("180,5", 1, 300)).toBeUndefined()
    expect(numberInRange("301", 1, 300)).toBe("Допустимый диапазон: 1–300")
    expect(numberInRange("abc", 1, 300)).toBe("Введите число")
  })

  it("операционный случай", () => {
    const errors = validateOperation({ operation_date: "", operation_time: "", type_operation: "", operation_name: " ", diagnosis_name: "",
      pid: "", history_number: "", doctor: "", nurse: "", height: "0", weight: "" })
    expect(errors.operation_date).toBeDefined()
    expect(errors.type_operation).toBeDefined()
    expect(errors.operation_name).toBeDefined()
    expect(errors.height).toBeDefined()
    expect(errors.weight).toBeUndefined()
  })

  it("лабораторные показатели", () => {
    expect(validateLabValue({ code: "HGB", label: "", unit: "", type: "number" }, "132,5")).toBeUndefined()
    expect(validateLabValue({ code: "HGB", label: "", unit: "", type: "number" }, "-1")).toBe("0…999")
    expect(validateLabValue({ code: "BE", label: "", unit: "", type: "signed" }, "-2.5")).toBeUndefined()
    expect(validateLabValue({ code: "ket", label: "", unit: "", type: "plus" }, "++")).toBeUndefined()
    expect(validateLabValue({ code: "ket", label: "", unit: "", type: "plus" }, "+-")).toBe("Только «+»")
  })
})
