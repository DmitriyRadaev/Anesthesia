import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { OperationStatus, PatientStatus, Role, type Patient } from "../api/types"
import { validatePatient } from "../pages/PatientFormPage"
import { makeUser, mockApi, page, renderApp } from "./utils"

const doctor = makeUser({ id: 7 })
const nurse = makeUser({ id: 8, role: Role.NURSE, role_display: "Медсестра/Медбрат" })

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 1, status: PatientStatus.ACTIVE, status_display: "Активная", surname: "Сидоров", firstname: "Алексей", lastname: "Петрович",
    full_name: "Сидоров Алексей Петрович", sex: 1, sex_name: "Мужской", birthdate: "1968-11-23", blood_group: 1, blood_group_name: "0 (I)",
    blood_rh: 2, blood_rh_name: "Rh+", snils: "", enp: "", height: 176, weight: 82, created_at: "", updated_at: "",
    operations: [{
      id: 10, status: OperationStatus.ARRIVED, status_display: "Поступил", operation_date: "2026-10-20", operation_time: "09:00:00",
      type_operation: 3, type_operation_name: "Плановая", operation_name: "Грыжесечение", diagnosis_name: "Паховая грыжа", pid: "P-1",
      reason_cancel: "", doctor: 7, doctor_name: "Тестов Иван Петрович", nurse: null, nurse_name: null,
    }],
    ...overrides,
  }
}

const catalogs = (url: URL) => (url.pathname.startsWith("/api/catalogs/") ? { body: [{ id: 1, name: "Мужской" }, { id: 2, name: "Женский" }] } : undefined)

describe("реестр пациентов", () => {
  it("показывает пациентов с операционными случаями и действиями", async () => {
    mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/patients/") return { body: page([patient()]) }
      return undefined
    })
    renderApp("/patients", doctor)
    const card = await screen.findByRole("article", { name: "Сидоров Алексей Петрович" })
    expect(within(card).getByText("ОС №10: Грыжесечение")).toBeInTheDocument()
    expect(within(card).getByRole("link", { name: "Наркозная карта" })).toHaveAttribute("href", "/operations/10/card")
    expect(within(card).getByRole("button", { name: "Отменить" })).toBeInTheDocument() // назначенный врач
    expect(within(card).queryByRole("link", { name: "+ Операционный случай" })).not.toBeInTheDocument() // есть активный ОС
  })

  it("пустой реестр и фильтры передаются в API", async () => {
    const { calls } = mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/patients/") return { body: page([]) }
      return undefined
    })
    renderApp("/patients?mine=1", doctor)
    expect(await screen.findByText("Пациенты не найдены")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Мои пациенты" })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText("Статус карточки"), "3")
    await userEvent.type(screen.getByLabelText("Поиск по фамилии"), "Сид")
    await userEvent.click(screen.getByRole("button", { name: "Найти" }))
    await waitFor(() => expect(calls.at(-1)!.path).toMatch(/status=3/))
    expect(calls.at(-1)!.path).toContain("mine=true")
    expect(decodeURIComponent(calls.at(-1)!.path)).toContain("search_surname=Сид")
  })

  it("медсестра видит реестр только для чтения", async () => {
    mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: nurse }
      if (url.pathname === "/api/patients/") return { body: page([patient({ status: PatientStatus.ARCHIVE, operations: [] })]) }
      return undefined
    })
    renderApp("/patients", nurse)
    await screen.findByText("Сидоров Алексей Петрович")
    expect(screen.queryByRole("button", { name: "+ Новый пациент" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Редактировать" })).not.toBeInTheDocument()
  })

  it("отмена ОС требует указать причину", async () => {
    const { calls } = mockApi((url, init) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/operations/10/cancel/" && init.method === "POST") return { body: {} }
      if (url.pathname === "/api/patients/") return { body: page([patient()]) }
      return undefined
    })
    renderApp("/patients", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Отменить" }))
    await userEvent.click(screen.getByRole("button", { name: "Отменить ОС" }))
    expect(screen.getByText("Укажите причину отмены")).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Причина отмены/), "Отказ пациента")
    await userEvent.click(screen.getByRole("button", { name: "Отменить ОС" }))
    await waitFor(() => expect(calls.some((c) => c.path === "/api/operations/10/cancel/")).toBe(true))
    expect(calls.find((c) => c.path === "/api/operations/10/cancel/")!.body).toEqual({ reason_cancel: "Отказ пациента" })
  })

  it("ошибка бизнес-правила при завершении ОС показывается пользователю", async () => {
    mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/operations/10/finish/") return { status: 409, body: { detail: "Анестезия не окончена.", code: "conflict" } }
      if (url.pathname === "/api/patients/") return { body: page([patient()]) }
      return undefined
    })
    renderApp("/patients", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Завершить" }))
    await userEvent.click(screen.getAllByRole("button", { name: "Завершить" }).at(-1)!)
    expect(await screen.findByText("Анестезия не окончена.")).toBeInTheDocument()
  })
})

describe("карточка пациента", () => {
  it("validatePatient проверяет обязательные поля, ФИО и дату рождения", () => {
    const errors = validatePatient({ surname: "Ivan0v", firstname: "", lastname: "", sex: "", birthdate: "2999-01-01",
      blood_group: "", blood_rh: "1", snils: "12a", enp: "" })
    expect(errors.surname).toBeDefined()
    expect(errors.firstname).toBe("Обязательное поле")
    expect(errors.lastname).toBeUndefined()
    expect(errors.birthdate).toBe("Дата не может быть в будущем")
    expect(errors.sex).toBeDefined()
    expect(errors.snils).toBeDefined()
  })

  it("создаёт пациента и возвращается в реестр", async () => {
    const { calls } = mockApi((url, init) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/patients/" && init.method === "POST") return { status: 201, body: patient() }
      if (url.pathname === "/api/patients/") return { body: page([]) }
      return catalogs(url)
    })
    renderApp("/patients/new", doctor)
    await userEvent.type(await screen.findByLabelText(/Фамилия/), "Иванов")
    await userEvent.type(screen.getByLabelText(/^Имя/), "Иван")
    await userEvent.selectOptions(screen.getByLabelText(/Пол/), "1")
    await userEvent.type(screen.getByLabelText(/Дата рождения/), "1980-05-17")
    await userEvent.selectOptions(screen.getByLabelText(/Группа крови/), "1")
    await userEvent.selectOptions(screen.getByLabelText(/Резус/), "2")
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(await screen.findByRole("heading", { name: "Все пациенты" })).toBeInTheDocument()
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ surname: "Иванов", sex: 1, birthdate: "1980-05-17", blood_rh: 2 })
  })

  it("показывает ошибку дубликата от сервера", async () => {
    mockApi((url, init) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/patients/" && init.method === "POST") {
        return { status: 400, body: { detail: "Пациент Иванов Иван уже существует.", code: "invalid", errors: { non_field_errors: ["Пациент Иванов Иван уже существует."] } } }
      }
      return catalogs(url)
    })
    renderApp("/patients/new", doctor)
    await userEvent.type(await screen.findByLabelText(/Фамилия/), "Иванов")
    await userEvent.type(screen.getByLabelText(/^Имя/), "Иван")
    await userEvent.selectOptions(screen.getByLabelText(/Пол/), "1")
    await userEvent.type(screen.getByLabelText(/Дата рождения/), "1980-05-17")
    await userEvent.selectOptions(screen.getByLabelText(/Группа крови/), "1")
    await userEvent.selectOptions(screen.getByLabelText(/Резус/), "1")
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(await screen.findByText("Пациент Иванов Иван уже существует.")).toBeInTheDocument()
  })
})
