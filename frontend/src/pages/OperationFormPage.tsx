import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ApiError } from "../api/client"
import { operationsApi, patientsApi, usersApi } from "../api/endpoints"
import { Role, type OperationInput } from "../api/types"
import { useCurrentUser } from "../auth/AuthContext"
import { Button } from "../components/ui/Button"
import { useUnsavedChanges } from "../components/UnsavedChanges"
import { ErrorAlert, QueryState } from "../components/ui/Feedback"
import { Input, Select } from "../components/ui/Form"
import { Card, PageHeader } from "../components/ui/Misc"
import { useToast } from "../components/ui/Toast"
import { toOptions, useCatalog } from "../hooks/useCatalog"
import { formatDate, todayISO } from "../utils/format"
import { hasErrors, mergeServerErrors, numberInRange, required, type Errors } from "../utils/validation"

const FIELDS = ["operation_date", "operation_time", "type_operation", "operation_name", "diagnosis_name", "pid",
  "history_number", "doctor", "nurse", "height", "weight"] as const
type FormState = Record<(typeof FIELDS)[number], string>

export function validateOperation(form: FormState): Errors<keyof FormState> {
  return {
    operation_date: required(form.operation_date),
    type_operation: required(form.type_operation),
    operation_name: required(form.operation_name),
    height: numberInRange(form.height, 1, 300),
    weight: numberInRange(form.weight, 1, 300),
  }
}

export function OperationFormPage() {
  const { patientId, operationId } = useParams()
  const isEdit = Boolean(operationId)
  const user = useCurrentUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const notify = useToast()
  const typeOperation = useCatalog("type_operation")
  const staff = useQuery({ queryKey: ["medical-staff"], queryFn: usersApi.medicalStaff, staleTime: 60_000 })
  const operation = useQuery({ queryKey: ["operation", operationId], queryFn: () => operationsApi.get(Number(operationId)), enabled: isEdit })
  const patientIdNumber = isEdit ? operation.data?.patient : Number(patientId)
  const patient = useQuery({
    queryKey: ["patient", String(patientIdNumber)],
    queryFn: () => patientsApi.get(patientIdNumber!),
    enabled: Boolean(patientIdNumber),
  })

  const [form, setForm] = useState<FormState>({
    operation_date: todayISO(), operation_time: "", type_operation: "3", operation_name: "", diagnosis_name: "", pid: "",
    history_number: "", doctor: user.role === Role.DOCTOR ? String(user.id) : "", nurse: "", height: "", weight: "",
  })
  const [errors, setErrors] = useState<Errors<keyof FormState>>({})
  const [dirty, setDirty] = useState(false)
  useUnsavedChanges(dirty)

  useEffect(() => {
    const op = operation.data
    if (!op) return
    setForm({
      operation_date: op.operation_date ?? "", operation_time: op.operation_time?.slice(0, 5) ?? "",
      type_operation: String(op.type_operation), operation_name: op.operation_name, diagnosis_name: op.diagnosis_name,
      pid: op.pid, history_number: op.history_number, doctor: op.doctor ? String(op.doctor) : "",
      nurse: op.nurse ? String(op.nurse) : "", height: op.height ?? "", weight: op.weight ?? "",
    })
  }, [operation.data])

  // При создании рост и вес подставляются из предыдущего ОС пациента.
  useEffect(() => {
    if (!isEdit && patient.data?.height) {
      setForm((f) => ({ ...f, height: f.height || String(patient.data.height ?? ""), weight: f.weight || String(patient.data.weight ?? "") }))
    }
  }, [isEdit, patient.data])

  const save = useMutation({
    mutationFn: (data: OperationInput) => (isEdit ? operationsApi.update(Number(operationId), data) : operationsApi.create(data)),
    onSuccess: () => {
      notify(isEdit ? "Операционный случай сохранён" : "Операционный случай создан")
      queryClient.invalidateQueries({ queryKey: ["patients"] })
      queryClient.invalidateQueries({ queryKey: ["operation"] })
      navigate("/patients")
    },
    onError: (error) => error instanceof ApiError && setErrors(mergeServerErrors(FIELDS, error.errors)),
  })

  const set = (field: keyof FormState) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setDirty(true)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateOperation(form)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return
    const toNumber = (value: string) => (value ? Number(value) : null)
    save.mutate({
      ...(isEdit ? {} : { patient: Number(patientId) }),
      operation_date: form.operation_date,
      operation_time: form.operation_time || null,
      type_operation: Number(form.type_operation),
      operation_name: form.operation_name.trim(),
      diagnosis_name: form.diagnosis_name.trim(),
      pid: form.pid.trim(),
      history_number: form.history_number.trim(),
      doctor: toNumber(form.doctor),
      nurse: toNumber(form.nurse),
      height: form.height ? form.height.replace(",", ".") : null,
      weight: form.weight ? form.weight.replace(",", ".") : null,
    })
  }

  // Врач может назначить врачом только себя (правило исходной системы).
  const doctorOptions = (staff.data?.doctors ?? [])
    .filter((d) => user.role !== Role.DOCTOR || d.id === user.id)
    .map((d) => ({ value: d.id, label: d.full_name }))
  const nurseOptions = (staff.data?.nurses ?? []).map((n) => ({ value: n.id, label: n.full_name }))
  const shownFieldErrors = save.error instanceof ApiError && Object.keys(mergeServerErrors(FIELDS, save.error.errors)).length > 0

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isEdit ? `Операционный случай №${operationId}` : "Новый операционный случай"}
        subtitle={patient.data && `${patient.data.full_name}, ${formatDate(patient.data.birthdate)}`}
      />
      <QueryState isLoading={(isEdit && operation.isLoading) || patient.isLoading} error={operation.error ?? patient.error}>
        <Card>
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            {save.error && !shownFieldErrors && <div className="sm:col-span-2"><ErrorAlert error={save.error} /></div>}
            <Input label="Дата операции" type="date" required value={form.operation_date} error={errors.operation_date}
                   onChange={set("operation_date")} />
            <Input label="Время поступления в операционную" type="time" value={form.operation_time}
                   error={errors.operation_time} onChange={set("operation_time")} />
            <Select label="Тип операции" required options={toOptions(typeOperation.data)} value={form.type_operation}
                    error={errors.type_operation} onChange={set("type_operation")} />
            <Input label="PID (идентификатор в мониторах)" value={form.pid} error={errors.pid} onChange={set("pid")} />
            <Input label="Наименование операции" required wrapperClassName="sm:col-span-2" value={form.operation_name}
                   error={errors.operation_name} onChange={set("operation_name")} />
            <Input label="Диагноз" wrapperClassName="sm:col-span-2" value={form.diagnosis_name} error={errors.diagnosis_name}
                   onChange={set("diagnosis_name")} />
            <Select label="Врач-анестезиолог" placeholder="Не назначен" options={doctorOptions} value={form.doctor}
                    error={errors.doctor} onChange={set("doctor")} />
            <Select label="Медсестра-анестезист" placeholder="Не назначена" options={nurseOptions} value={form.nurse}
                    error={errors.nurse} onChange={set("nurse")} />
            <Input label="Рост, см" inputMode="decimal" value={form.height} error={errors.height} onChange={set("height")} />
            <Input label="Вес, кг" inputMode="decimal" value={form.weight} error={errors.weight} onChange={set("weight")} />
            <Input label="Номер истории болезни" value={form.history_number} error={errors.history_number}
                   onChange={set("history_number")} />
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={save.isPending}>Сохранить</Button>
              <Button variant="secondary" onClick={() => navigate(-1)}>Отмена</Button>
            </div>
          </form>
        </Card>
      </QueryState>
    </div>
  )
}
