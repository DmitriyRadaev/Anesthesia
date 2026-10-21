import dayjs from "dayjs"

export const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD.MM.YYYY") : "—")
export const formatDateTime = (value?: string | null) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—")
export const formatTime = (value?: string | null) => {
  if (!value) return "—"
  // "HH:MM:SS" или ISO datetime
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : dayjs(value).format("HH:mm")
}

export function ageOn(birthdate: string, at: string | Date = new Date()): number {
  return dayjs(at).diff(dayjs(birthdate), "year")
}

export const todayISO = () => dayjs().format("YYYY-MM-DD")

/** Пустая строка → null; число/строка → строка (для числовых полей форм). */
export const emptyToNull = (value: string | number | null | undefined) =>
  value === "" || value === undefined || value === null ? null : value

export const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")))

export function fullName(parts: { surname?: string; firstname?: string; lastname?: string }) {
  return [parts.surname, parts.firstname, parts.lastname].filter(Boolean).join(" ")
}
