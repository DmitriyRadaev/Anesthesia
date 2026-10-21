import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { ApiError } from "../api/client"
import { labsApi } from "../api/endpoints"
import type { LabField, LabSection } from "../api/types"
import { OperationHeader } from "../components/OperationHeader"
import { useUnsavedChanges } from "../components/UnsavedChanges"
import { Button } from "../components/ui/Button"
import { ErrorAlert, QueryState } from "../components/ui/Feedback"
import { Input } from "../components/ui/Form"
import { Card } from "../components/ui/Misc"
import { useToast } from "../components/ui/Toast"
import { formatDateTime } from "../utils/format"

type Values = Record<string, Record<string, string>>

export function validateLabValue(field: LabField, value: string): string | undefined {
  if (!value.trim()) return undefined
  if (field.type === "number" || field.type === "signed") {
    const number = Number(value.replace(",", "."))
    if (Number.isNaN(number)) return "Число"
    const min = field.type === "signed" ? -999 : 0
    if (number < min || number > 999) return `${min}…999`
  }
  if (field.type === "plus" && !/^\+{1,4}$/.test(value.trim())) return "Только «+»"
  return undefined
}

export function LabPage() {
  const operationId = Number(useParams().operationId)
  const queryClient = useQueryClient()
  const notify = useToast()
  const schema = useQuery({ queryKey: ["lab-schema"], queryFn: () => labsApi.schema(operationId), staleTime: Infinity })
  const result = useQuery({ queryKey: ["labs", operationId], queryFn: () => labsApi.get(operationId) })
  const [values, setValues] = useState<Values>({})
  const [dirty, setDirty] = useState(false)
  useUnsavedChanges(dirty)

  useEffect(() => {
    if (!result.data) return
    const loaded: Values = {}
    for (const [section, fields] of Object.entries(result.data.values)) {
      loaded[section] = Object.fromEntries(Object.entries(fields).map(([code, value]) => [code, String(value)]))
    }
    setValues(loaded)
    setDirty(false)
  }, [result.data])

  const save = useMutation({
    mutationFn: () => labsApi.save(operationId, values),
    onSuccess: (data) => {
      queryClient.setQueryData(["labs", operationId], data)
      notify("Результаты сохранены")
    },
  })

  const errors: Record<string, string | undefined> = {}
  for (const section of schema.data ?? []) {
    for (const field of section.fields) {
      errors[`${section.key}.${field.code}`] = validateLabValue(field, values[section.key]?.[field.code] ?? "")
    }
  }
  const serverErrors = save.error instanceof ApiError ? save.error.errors : {}
  const hasClientErrors = Object.values(errors).some(Boolean)

  const setValue = (section: string, code: string, value: string) => {
    setValues((current) => ({ ...current, [section]: { ...current[section], [code]: value } }))
    setDirty(true)
  }

  return (
    <div className="max-w-6xl">
      <OperationHeader operationId={operationId} />
      <QueryState isLoading={schema.isLoading || result.isLoading} error={schema.error ?? result.error}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {result.data?.updated_at
              ? `Изменено ${formatDateTime(result.data.updated_at)} (${result.data.updated_by_name ?? "—"})`
              : "Результаты ещё не вносились"}
          </p>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={hasClientErrors}>Сохранить</Button>
        </div>
        {save.error && <div className="mb-4"><ErrorAlert error={save.error} /></div>}
        <div className="grid gap-4 lg:grid-cols-2">
          {schema.data?.map((section: LabSection) => (
            <Card key={section.key} title={section.title}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {section.fields.map((field) => {
                  const key = `${section.key}.${field.code}`
                  return (
                    <Input
                      key={field.code}
                      label={<>{field.label}{field.unit && <span className="font-normal text-slate-400">, {field.unit}</span>}</>}
                      value={values[section.key]?.[field.code] ?? ""}
                      inputMode={field.type === "text" || field.type === "plus" ? "text" : "decimal"}
                      error={errors[key] ?? serverErrors[key]?.[0]}
                      onChange={(event) => setValue(section.key, field.code, event.target.value)}
                    />
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      </QueryState>
    </div>
  )
}
