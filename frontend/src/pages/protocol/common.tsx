import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"
import { ApiError } from "../../api/client"
import { protocolApi } from "../../api/endpoints"
import type { ID } from "../../api/types"
import { Button } from "../../components/ui/Button"
import { ErrorAlert, QueryState } from "../../components/ui/Feedback"
import { Select } from "../../components/ui/Form"
import { useToast } from "../../components/ui/Toast"
import { useUnsavedChanges } from "../../components/UnsavedChanges"
import { toOptions, useCatalog } from "../../hooks/useCatalog"

/** Загрузка блока протокола и сохранение (по умолчанию PUT — полная замена значений блока). */
export function useProtocolBlock<T>(operationId: ID, block: string, method: "put" | "patch" = "put") {
  const queryClient = useQueryClient()
  const notify = useToast()
  const key = ["protocol", operationId, block]
  const query = useQuery({ queryKey: key, queryFn: () => protocolApi.get<T>(operationId, block) })
  const save = useMutation({
    mutationFn: (data: unknown) => protocolApi[method]<T>(operationId, block, data),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data)
      notify("Сохранено")
    },
  })
  return { query, save }
}

/** Локальное состояние формы, инициализируемое данными с сервера. */
export function useFormFrom<T>(data: T | undefined, toForm: (data: T) => Record<string, unknown>) {
  const [form, replaceForm] = useState<Record<string, unknown>>({})
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    // загрузка или сохранение блока: форма снова совпадает с сервером
    if (data !== undefined) {
      replaceForm(toForm(data))
      setDirty(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  useUnsavedChanges(dirty)
  const setForm: typeof replaceForm = (value) => {
    replaceForm(value)
    setDirty(true)
  }
  const set = (field: string, value: unknown) => setForm((current) => ({ ...current, [field]: value }))
  return { form, setForm, set }
}

interface SectionProps {
  title: string
  isLoading: boolean
  loadError: unknown
  saving: boolean
  saveError: unknown
  onSave: () => void
  children: ReactNode
  extra?: ReactNode
}

export function Section({ title, isLoading, loadError, saving, saveError, onSave, children, extra }: SectionProps) {
  return (
    <section className="mb-4 rounded-[10px] bg-app-block p-[18px]" aria-label={title}>
      <h3 className="text-base text-slate-400">{title}:</h3>
      <hr className="my-3 border-t border-dashed border-slate-200" />
      <QueryState isLoading={isLoading} error={loadError}>
        {saveError !== null && saveError !== undefined && <div className="mb-3"><ErrorAlert error={saveError} /></div>}
        {children}
        {extra}
        <div className="mt-4 flex justify-end">
          <Button loading={saving} onClick={onSave}>Сохранить</Button>
        </div>
      </QueryState>
    </section>
  )
}

export const fieldError = (error: unknown, field: string) => (error instanceof ApiError ? error.field(field) : undefined)

interface CatalogSelectProps {
  slug: string
  label: string
  value: unknown
  onChange: (value: number | null) => void
  params?: Record<string, string | number>
  error?: string
  enabled?: boolean
  placeholder?: string
}

export function CatalogSelect({ slug, label, value, onChange, params, error, enabled = true, placeholder = "Не выбрано" }: CatalogSelectProps) {
  const catalog = useCatalog(slug, params, enabled)
  return (
    <Select
      label={label}
      placeholder={placeholder}
      options={toOptions(catalog.data)}
      value={value === null || value === undefined ? "" : String(value)}
      error={error}
      disabled={!enabled}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
    />
  )
}

/** Плитки выбора (app-pickItem исходной системы): повторный щелчок по выбранной плитке снимает выбор. */
export function PickItems<T extends string | number | boolean>({ label, value, options, onChange }: {
  label: string
  value: T | null | undefined
  options: Array<{ value: T; label: string }>
  onChange: (value: T | null) => void
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <span className="mb-2 block text-[11px] font-medium leading-[13px] text-slate-700/60">{label}</span>
      <div className="flex gap-5">
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active ? null : option.value)}
              className={`w-full rounded-[10px] border border-slate-200 px-2.5 py-2.5 text-center text-sm font-medium ${
                active
                  ? "bg-app-primary text-white shadow-[inset_-3px_-5px_9px_rgba(247,248,255,0.44),inset_7px_10px_6px_rgba(75,97,161,0.26)]"
                  : "bg-app-page text-slate-700 shadow-[-3px_-5px_9px_#fff,3px_7px_6px_rgba(75,97,161,0.26)]"
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Да / Нет для nullable boolean (не выбрано — null). */
export function YesNo({ label, value, onChange }: { label: string; value: unknown; onChange: (value: boolean | null) => void }) {
  return (
    <PickItems label={label} value={typeof value === "boolean" ? value : null} onChange={onChange}
               options={[{ value: true, label: "Да" }, { value: false, label: "Нет" }]} />
  )
}

export const str = (value: unknown) => (value === null || value === undefined ? "" : String(value))
export const numOrNull = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")))
