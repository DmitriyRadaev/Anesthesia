import type { ReactNode } from "react"
import { Button } from "./Button"

const BADGE_COLORS = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-sky-100 text-sky-800",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  violet: "bg-violet-100 text-violet-800",
}
export type BadgeColor = keyof typeof BADGE_COLORS

export function Badge({ color = "gray", children }: { color?: BadgeColor; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_COLORS[color]}`}>{children}</span>
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-app-page shadow-app ${className}`}>
      {(title || actions) && (
        <header className="mx-5 flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-2 pt-4">
          {title && <h2 className="text-xl font-medium text-slate-400">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-medium text-slate-700">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

interface PaginationProps {
  page: number
  pageSize?: number
  count: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize = 20, count, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (pages <= 1) return null
  return (
    <nav aria-label="Страницы" className="mt-4 flex items-center justify-center gap-3 text-sm text-slate-600">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Назад
      </Button>
      <span>
        Страница {page} из {pages}
      </span>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Вперёд →
      </Button>
    </nav>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: Array<{ value: T; label: string }> }) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            value === item.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function DefinitionList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt className="text-slate-500">{term}</dt>
          <dd className="font-medium text-slate-900">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}
