import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { tokenStorage } from "../api/client"
import { Role } from "../api/types"
import { makeUser, mockApi, page, renderApp } from "./utils"

describe("авторизация", () => {
  it("анонимного пользователя перенаправляет на страницу входа", async () => {
    mockApi(() => undefined)
    renderApp("/patients")
    expect(await screen.findByRole("button", { name: "Войти" })).toBeInTheDocument()
  })

  it("показывает ошибки обязательных полей без запроса к серверу", async () => {
    const { calls } = mockApi(() => undefined)
    renderApp("/login")
    await userEvent.click(await screen.findByRole("button", { name: "Войти" }))
    expect(screen.getByText("Введите логин")).toBeInTheDocument()
    expect(screen.getByText("Введите пароль")).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it("показывает сообщение сервера при неверном пароле", async () => {
    mockApi((url) => (url.pathname === "/api/auth/login/" ? { status: 401, body: { detail: "Неверный логин или пароль." } } : undefined))
    renderApp("/login")
    await userEvent.type(await screen.findByLabelText("Логин"), "doctor")
    await userEvent.type(screen.getByLabelText("Пароль"), "wrong")
    await userEvent.click(screen.getByRole("button", { name: "Войти" }))
    expect(await screen.findByText("Неверный логин или пароль.")).toBeInTheDocument()
    expect(tokenStorage.get()).toBeNull()
  })

  it("после входа сохраняет токен и открывает реестр пациентов", async () => {
    const user = makeUser()
    const { calls } = mockApi((url) => {
      if (url.pathname === "/api/auth/login/") return { body: { token: "abc", expires_at: null, user } }
      if (url.pathname === "/api/patients/") return { body: page([]) }
      return undefined
    })
    renderApp("/login")
    await userEvent.type(await screen.findByLabelText("Логин"), "doctor")
    await userEvent.type(screen.getByLabelText("Пароль"), "Secret-123")
    await userEvent.click(screen.getByRole("button", { name: "Войти" }))
    expect(await screen.findByRole("heading", { name: "Все пациенты" })).toBeInTheDocument()
    expect(tokenStorage.get()).toBe("abc")
    expect(calls[0]).toMatchObject({ method: "POST", body: { username: "doctor", password: "Secret-123" } })
  })

  it("администратор после входа попадает в управление пользователями", async () => {
    const admin = makeUser({ role: Role.ADMIN, role_display: "Администратор" })
    mockApi((url) => {
      if (url.pathname === "/api/auth/login/") return { body: { token: "abc", expires_at: null, user: admin } }
      if (url.pathname === "/api/users/") return { body: page([admin]) }
      return undefined
    })
    renderApp("/login")
    await userEvent.type(await screen.findByLabelText("Логин"), "admin")
    await userEvent.type(screen.getByLabelText("Пароль"), "Secret-123")
    await userEvent.click(screen.getByRole("button", { name: "Войти" }))
    expect(await screen.findByRole("heading", { name: "Пользователи" })).toBeInTheDocument()
  })

  it("закрывает доступ к админ-панели для врача", async () => {
    const doctor = makeUser()
    mockApi((url) => (url.pathname === "/api/auth/me/" ? { body: doctor } : undefined))
    renderApp("/admin/users", doctor)
    expect(await screen.findByText("Доступ запрещён")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Пользователи" })).not.toBeInTheDocument()
  })

  it("выход отзывает токен и возвращает на страницу входа", async () => {
    const doctor = makeUser()
    const { calls } = mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/patients/") return { body: page([]) }
      if (url.pathname === "/api/auth/logout/") return { status: 204 }
      return undefined
    })
    renderApp("/patients", doctor)
    await userEvent.click(await screen.findByRole("button", { name: "Выйти" }))
    expect(await screen.findByRole("button", { name: "Войти" })).toBeInTheDocument()
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/auth/logout/")).toBe(true)
    expect(tokenStorage.get()).toBeNull()
  })

  it("ответ 401 (истёкший токен) завершает сессию", async () => {
    mockApi((url) => (url.pathname === "/api/auth/me/" ? { status: 401, body: { detail: "Срок действия токена истёк." } } : undefined))
    renderApp("/patients", makeUser())
    await waitFor(() => expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument())
    expect(tokenStorage.get()).toBeNull()
  })
})
