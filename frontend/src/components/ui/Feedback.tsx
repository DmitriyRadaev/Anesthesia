import type { ReactNode } from "react"
import { ApiError } from "../../api/client"
import { Button } from "./Button"
import { Spinner } from "./Spinner"

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return "Неизвестная ошибка"
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[kind]
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  )
}

/** Сообщение об ошибке с подробностями по полям (если сервер их вернул). */
export function ErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const fieldErrors = error instanceof ApiError ? Object.entries(error.errors) : []
  return (
    <Alert kind="error">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{errorMessage(error)}</p>
          {fieldErrors.length > 1 && (
            <ul className="mt-1 list-inside list-disc text-xs">
              {fieldErrors.map(([field, messages]) => (
                <li key={field}>
                  <span className="font-mono">{field}</span>: {messages.join(" ")}
                </li>
              ))}
            </ul>
          )}
        </div>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        )}
      </div>
    </Alert>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

interface QueryStateProps {
  isLoading: boolean
  error: unknown
  onRetry?: () => void
  children: ReactNode
  loadingLabel?: string
}

/** Единообразное отображение состояний загрузки/ошибки для запросов. */
export function QueryState({ isLoading, error, onRetry, children, loadingLabel }: QueryStateProps) {
  if (isLoading) return <Spinner className="py-8" label={loadingLabel} />
  if (error) return <ErrorAlert error={error} onRetry={onRetry} />
  return <>{children}</>
}
