/** Клиентские правила валидации (дублируют серверные для мгновенной обратной связи). */

export const NAME_RE = /^[ЁёA-Za-zА-Яа-я\s-]+$/

export type Errors<T extends string = string> = Partial<Record<T, string>>

export function required(value: unknown, message = "Обязательное поле"): string | undefined {
  if (value === null || value === undefined) return message
  if (typeof value === "string" && value.trim() === "") return message
  return undefined
}

export function personName(value: string, isRequired = true): string | undefined {
  if (!value.trim()) return isRequired ? "Обязательное поле" : undefined
  return NAME_RE.test(value) ? undefined : "Допустимы только буквы, пробел и дефис"
}

export function notFutureDate(value: string): string | undefined {
  if (!value) return "Обязательное поле"
  return new Date(value) > new Date() ? "Дата не может быть в будущем" : undefined
}

export function numberInRange(value: string, min: number, max: number, isRequired = false): string | undefined {
  if (!value.trim()) return isRequired ? "Обязательное поле" : undefined
  const number = Number(value.replace(",", "."))
  if (Number.isNaN(number)) return "Введите число"
  if (number < min || number > max) return `Допустимый диапазон: ${min}–${max}`
  return undefined
}

export const hasErrors = (errors: Errors) => Object.values(errors).some(Boolean)

/** Слияние клиентских ошибок с ошибками полей из ответа сервера. */
export function mergeServerErrors<T extends string>(fields: readonly T[], serverErrors: Record<string, string[]>): Errors<T> {
  const result: Errors<T> = {}
  for (const field of fields) {
    const message = serverErrors[field]?.[0]
    if (message) result[field] = message
  }
  return result
}
