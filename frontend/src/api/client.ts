/** HTTP-клиент REST API: токен авторизации, разбор ошибок, обработка 401. */

const TOKEN_KEY = "anesthesia.token"
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? ""

export const tokenStorage = {
  get: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly errors: FieldErrors

  constructor(status: number, message: string, code?: string, errors: FieldErrors = {}) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.errors = errors
  }

  /** Первая ошибка конкретного поля (поддерживает вложенные пути вида `items.0.dose`). */
  field(name: string): string | undefined {
    return this.errors[name]?.[0]
  }
}

let unauthorizedHandler: (() => void) | null = null
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

type Query = Record<string, string | number | boolean | null | undefined | Array<string | number>>

export function buildQuery(params?: Query): string {
  if (!params) return ""
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)))
    else search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}

/** Приводит вложенные ошибки DRF ({items: [{dose: [..]}]}) к плоскому виду {"items.0.dose": [..]}. */
export function flattenErrors(errors: unknown, prefix = ""): FieldErrors {
  const result: FieldErrors = {}
  if (Array.isArray(errors)) {
    if (errors.every((e) => typeof e === "string")) {
      result[prefix || "non_field_errors"] = errors as string[]
    } else {
      errors.forEach((item, index) => Object.assign(result, flattenErrors(item, prefix ? `${prefix}.${index}` : String(index))))
    }
  } else if (errors && typeof errors === "object") {
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      Object.assign(result, flattenErrors(value, prefix ? `${prefix}.${key}` : key))
    }
  } else if (typeof errors === "string") {
    result[prefix || "non_field_errors"] = [errors]
  }
  return result
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Query
  signal?: AbortSignal
}

async function send(path: string, { method = "GET", body, query, signal }: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" }
  const token = tokenStorage.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error
    throw new ApiError(0, "Сервер недоступен. Проверьте подключение к сети.")
  }

  if (!response.ok) {
    let data: { detail?: string; code?: string; errors?: unknown } = {}
    try {
      data = await response.json()
    } catch {
      /* тело ответа не JSON */
    }
    if (response.status === 401 && token && unauthorizedHandler) unauthorizedHandler()
    throw new ApiError(
      response.status,
      data.detail ?? `Ошибка запроса (${response.status})`,
      data.code,
      data.errors ? flattenErrors(data.errors) : {},
    )
  }
  return response
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Скачивание файла (например, отчёта Excel) с сохранением имени из Content-Disposition. */
export async function download(path: string, query?: Query): Promise<void> {
  const response = await send(path, { query })
  const disposition = response.headers.get("Content-Disposition") ?? ""
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
  const filename = encoded ? decodeURIComponent(encoded) : plain ?? "download"
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
