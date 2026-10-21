import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { tokenStorage } from "../api/client"
import { Role, type User } from "../api/types"
import { App } from "../App"
import { AuthProvider } from "../auth/AuthContext"
import { ToastProvider } from "../components/ui/Toast"

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1, username: "doctor", surname: "Тестов", firstname: "Иван", lastname: "Петрович", full_name: "Тестов Иван Петрович",
    birthdate: null, role: Role.DOCTOR, role_display: "Врач", is_active: true, employee_code: "", speciality: "", department: "",
    job_title: "", last_login: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
  }
}

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown } | undefined

/** Подмена fetch: обработчик получает URL и параметры запроса; без ответа — 404. */
export function mockApi(handler: Handler) {
  const calls: Array<{ method: string; path: string; body: unknown }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost")
    const method = init.method ?? "GET"
    calls.push({ method, path: url.pathname + url.search, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const result = handler(url, { ...init, method }) ?? { status: 404, body: { detail: "Не найдено" } }
    const status = result.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return { calls, fetchMock }
}

export const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results })

/** Рендер всего приложения на заданном маршруте; `user` — авторизованный пользователь (или аноним). */
export function renderApp(route: string, user?: User) {
  if (user) tokenStorage.set("test-token")
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}
