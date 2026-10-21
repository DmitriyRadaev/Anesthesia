import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Role } from "../api/types"
import { validateUserForm } from "../pages/admin/UsersPage"
import { makeUser, mockApi, page, renderApp } from "./utils"

const admin = makeUser({ id: 1, username: "admin", role: Role.ADMIN, role_display: "Администратор", full_name: "Админов Админ" })
const nurse = makeUser({ id: 2, username: "nurse", role: Role.NURSE, role_display: "Медсестра/Медбрат", full_name: "Сестрова Анна" })

describe("управление пользователями", () => {
  it("показывает список пользователей с ролями и статусами", async () => {
    const { calls } = mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: admin }
      if (url.pathname === "/api/users/") return { body: page([admin, { ...nurse, is_active: false }]) }
      return undefined
    })
    renderApp("/admin/users", admin)
    const row = (await screen.findByText("Сестрова Анна")).closest("tr")!
    expect(within(row).getByText("Медсестра/Медбрат")).toBeInTheDocument()
    expect(within(row).getByText("Деактивирован")).toBeInTheDocument()
    expect(within(row).getByRole("button", { name: "Активировать" })).toBeInTheDocument()
    // нельзя деактивировать самого себя
    const selfRow = within(screen.getByRole("table")).getByText("Админов Админ").closest("tr")!
    expect(within(selfRow).queryByRole("button", { name: "Деактивировать" })).not.toBeInTheDocument()
    expect(calls[1].path).toContain("ordering=surname")
  })

  it("фильтрует по роли и выполняет поиск", async () => {
    const { calls } = mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: admin }
      if (url.pathname === "/api/users/") return { body: page([nurse]) }
      return undefined
    })
    renderApp("/admin/users", admin)
    await screen.findByText("Сестрова Анна")
    await userEvent.selectOptions(screen.getByLabelText("Роль"), String(Role.NURSE))
    await userEvent.type(screen.getByLabelText("Поиск"), "Сестр")
    await userEvent.click(screen.getByRole("button", { name: "Найти" }))
    await waitFor(() => expect(calls.at(-1)!.path).toContain("search=%D0%A1%D0%B5%D1%81%D1%82%D1%80"))
    expect(calls.at(-1)!.path).toContain(`role=${Role.NURSE}`)
  })

  it("создаёт пользователя: клиентская валидация и отправка формы", async () => {
    const { calls } = mockApi((url, init) => {
      if (url.pathname === "/api/auth/me/") return { body: admin }
      if (url.pathname === "/api/users/" && init.method === "POST") return { status: 201, body: nurse }
      if (url.pathname === "/api/users/") return { body: page([admin]) }
      return undefined
    })
    renderApp("/admin/users", admin)
    await userEvent.click(await screen.findByRole("button", { name: "+ Новый пользователь" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog.parentElement!.parentElement!).getByRole("button", { name: "Создать" }))
    expect(await within(dialog).findAllByText("Обязательное поле")).not.toHaveLength(0)
    expect(within(dialog).getByText("Не менее 8 символов")).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText(/Логин/), "new.nurse")
    await userEvent.type(within(dialog).getByLabelText(/Пароль/), "Strong-Pass-1")
    await userEvent.type(within(dialog).getByLabelText(/Фамилия/), "Новикова")
    await userEvent.type(within(dialog).getByLabelText(/^Имя/), "Ольга")
    await userEvent.selectOptions(within(dialog).getByLabelText(/Роль/), String(Role.NURSE))
    await userEvent.click(screen.getByRole("button", { name: "Создать" }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true))
    const post = calls.find((c) => c.method === "POST")!
    expect(post.body).toMatchObject({ username: "new.nurse", password: "Strong-Pass-1", surname: "Новикова", role: Role.NURSE })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("показывает ошибки полей, возвращённые сервером", async () => {
    mockApi((url, init) => {
      if (url.pathname === "/api/auth/me/") return { body: admin }
      if (url.pathname === "/api/users/" && init.method === "POST") {
        return { status: 400, body: { detail: "exists", code: "invalid", errors: { username: ["Пользователь с таким логином уже существует."] } } }
      }
      if (url.pathname === "/api/users/") return { body: page([admin]) }
      return undefined
    })
    renderApp("/admin/users", admin)
    await userEvent.click(await screen.findByRole("button", { name: "+ Новый пользователь" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText(/Логин/), "admin")
    await userEvent.type(within(dialog).getByLabelText(/Пароль/), "Strong-Pass-1")
    await userEvent.type(within(dialog).getByLabelText(/Фамилия/), "Иванов")
    await userEvent.type(within(dialog).getByLabelText(/^Имя/), "Иван")
    await userEvent.click(screen.getByRole("button", { name: "Создать" }))
    expect(await within(dialog).findByText("Пользователь с таким логином уже существует.")).toBeInTheDocument()
  })

  it("деактивирует пользователя после подтверждения", async () => {
    const { calls } = mockApi((url, init) => {
      if (url.pathname === "/api/auth/me/") return { body: admin }
      if (url.pathname === "/api/users/2/" && init.method === "PATCH") return { body: { ...nurse, is_active: false } }
      if (url.pathname === "/api/users/") return { body: page([admin, nurse]) }
      return undefined
    })
    renderApp("/admin/users", admin)
    const row = (await screen.findByText("Сестрова Анна")).closest("tr")!
    await userEvent.click(within(row).getByRole("button", { name: "Деактивировать" }))
    await userEvent.click(await screen.findByRole("button", { name: "Подтвердить" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/users/2/", body: { is_active: false } })
    expect(await screen.findByText("Учётная запись деактивирована")).toBeInTheDocument()
  })

  it("ИО заведующего не может назначать роли руководителей", async () => {
    const acting = makeUser({ id: 5, role: Role.ACTING_HEAD, role_display: "ИО заведующего отделением" })
    mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: acting }
      if (url.pathname === "/api/users/") return { body: page([acting, nurse]) }
      return undefined
    })
    renderApp("/admin/users", acting)
    await userEvent.click(await screen.findByRole("button", { name: "+ Новый пользователь" }))
    const roleSelect = within(await screen.findByRole("dialog")).getByLabelText(/Роль/)
    const values = Array.from((roleSelect as HTMLSelectElement).options).map((o) => o.value)
    expect(values).toEqual([String(Role.DOCTOR), String(Role.NURSE)])
  })

  it("validateUserForm проверяет логин, пароль и ФИО", () => {
    const errors = validateUserForm({ username: "bad login", password: "123", surname: "Ivan0v", firstname: "", lastname: "",
      birthdate: "", role: "1", job_title: "", speciality: "", department: "", employee_code: "" }, true)
    expect(errors.username).toBeDefined()
    expect(errors.password).toBe("Не менее 8 символов")
    expect(errors.surname).toBe("Допустимы только буквы, пробел и дефис")
    expect(errors.firstname).toBe("Обязательное поле")
    expect(validateUserForm({ username: "ok", password: "", surname: "Иванов", firstname: "Иван", lastname: "", birthdate: "",
      role: "1", job_title: "", speciality: "", department: "", employee_code: "" }, false).password).toBeUndefined()
  })
})
