import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ApiError } from "../api/client"
import { operationsApi, patientsApi } from "../api/endpoints"
import { OperationStatus, PatientStatus, type OperationBrief, type Patient } from "../api/types"
import { useCurrentUser } from "../auth/AuthContext"
import { hasRole, PATIENT_EDITOR_ROLES, SUPERVISOR_ROLES } from "../auth/roles"
import { Button, LinkButton } from "../components/ui/Button"
import { EmptyState, errorMessage, QueryState } from "../components/ui/Feedback"
import { Input, Select, Textarea } from "../components/ui/Form"
import { Badge, PageHeader, Pagination } from "../components/ui/Misc"
import { ConfirmDialog, Modal } from "../components/ui/Modal"
import { useToast } from "../components/ui/Toast"
import { ageOn, formatDate, formatTime } from "../utils/format"
import { OPERATION_STATUS, PATIENT_STATUS } from "../utils/statuses"

/** Цветная метка статуса карточки слева, как в исходном реестре. */
const STATUS_TAG: Record<PatientStatus, string> = {
  [PatientStatus.NEW]: "bg-[#ff1183]",
  [PatientStatus.ACTIVE]: "bg-[#41cd7d]",
  [PatientStatus.ARCHIVE]: "bg-[#dadada]",
}

const STATUS_OPTIONS = [
  { value: "1", label: "Новая" },
  { value: "2", label: "Активная" },
  { value: "3", label: "Архивная" },
]

export function PatientsPage() {
  const user = useCurrentUser()
  const canEdit = hasRole(user.role, PATIENT_EDITOR_ROLES)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mine = params.get("mine") === "1"
  const status = params.get("status") ?? ""
  const query = params.get("q") ?? ""
  const page = Number(params.get("page") ?? 1)
  const [searchText, setSearchText] = useState(query)

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    if (!("page" in patch)) next.delete("page")
    setParams(next)
  }

  const patients = useQuery({
    queryKey: ["patients", { mine, status, query, page }],
    queryFn: () => patientsApi.list({ mine, status: status ? Number(status) : "", search_surname: query, page }),
    placeholderData: (previous) => previous,
  })

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    updateParams({ q: searchText.trim() || null })
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={mine ? "Мои пациенты" : "Все пациенты"}
        subtitle={patients.data ? `Найдено: ${patients.data.count}` : undefined}
        actions={canEdit && <Button onClick={() => navigate("/patients/new")}>+ Новый пациент</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form onSubmit={submitSearch} className="flex items-end gap-2" role="search">
          <Input
            label="Поиск по фамилии"
            placeholder="Начало фамилии…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            wrapperClassName="w-64"
          />
          <Button type="submit" variant="secondary">Найти</Button>
          {query && (
            <Button variant="ghost" onClick={() => { setSearchText(""); updateParams({ q: null }) }}>
              Сбросить
            </Button>
          )}
        </form>
        <Select
          label="Статус карточки"
          placeholder="Все"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => updateParams({ status: event.target.value || null })}
          wrapperClassName="w-48"
        />
      </div>

      <QueryState isLoading={patients.isLoading} error={patients.error} onRetry={() => patients.refetch()}>
        {patients.data && patients.data.results.length === 0 ? (
          <EmptyState
            title="Пациенты не найдены"
            description={query || status ? "Измените условия поиска." : "Реестр пока пуст."}
            action={canEdit && <Button onClick={() => navigate("/patients/new")}>Добавить пациента</Button>}
          />
        ) : (
          <div className={`space-y-4 ${patients.isFetching ? "opacity-60" : ""}`}>
            {patients.data?.results.map((patient) => <PatientCard key={patient.id} patient={patient} />)}
          </div>
        )}
        {patients.data && (
          <Pagination page={page} count={patients.data.count} onChange={(next) => updateParams({ page: String(next) })} />
        )}
      </QueryState>
    </div>
  )
}

function PatientCard({ patient }: { patient: Patient }) {
  const user = useCurrentUser()
  const canEdit = hasRole(user.role, PATIENT_EDITOR_ROLES)
  const isSupervisor = hasRole(user.role, SUPERVISOR_ROLES)
  const queryClient = useQueryClient()
  const notify = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const hasActiveCase = patient.operations.some((op) => [OperationStatus.ARRIVED, OperationStatus.ON_OPERATION].includes(op.status))
  const canCreateCase = canEdit && patient.status !== PatientStatus.ACTIVE && !hasActiveCase

  const action = useMutation({
    mutationFn: async (kind: "archive" | "unarchive" | "delete"): Promise<void> => {
      if (kind === "delete") await patientsApi.remove(patient.id)
      else await patientsApi[kind](patient.id)
    },
    onSuccess: (_, kind) => {
      notify({ archive: "Карточка переведена в архив", unarchive: "Карточка возвращена из архива", delete: "Пациент удалён" }[kind])
      setConfirmDelete(false)
      queryClient.invalidateQueries({ queryKey: ["patients"] })
    },
    onError: (error) => notify(errorMessage(error), "error"),
  })

  const statusInfo = PATIENT_STATUS[patient.status]
  return (
    <article className="relative overflow-hidden rounded-2xl bg-app-page shadow-app" aria-label={patient.full_name}>
      <span className={`absolute inset-y-0 left-0 w-2.5 ${STATUS_TAG[patient.status]}`} aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-3 py-4 pl-8 pr-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-700">{patient.full_name}</h2>
            <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
          </div>
          <dl className="mt-2 flex flex-wrap gap-y-2">
            {([
              ["Дата рождения:", formatDate(patient.birthdate)],
              ["Пол:", patient.sex_name],
              ["Возраст:", ageOn(patient.birthdate)],
              ["Рост:", patient.height ?? "—"],
              ["Вес:", patient.weight ?? "—"],
              ["Группа крови:", patient.blood_group_name],
              ["Rh:", patient.blood_rh_name],
            ] as Array<[string, ReactNode]>).map(([label, value], index) => (
              <div key={label} className={`pr-2.5 ${index ? "border-l border-dashed border-slate-200 pl-2.5" : ""}`}>
                <dt className="text-[13px] text-slate-700/60">{label}</dt>
                <dd className="mt-[5px] text-base font-medium text-slate-700">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateCase && (
            <LinkButton to={`/patients/${patient.id}/operations/new`} size="sm" variant="primary">+ Операционный случай</LinkButton>
          )}
          {canEdit && (
            <LinkButton to={`/patients/${patient.id}/edit`} size="sm" variant="secondary">Редактировать</LinkButton>
          )}
          {canEdit && patient.status !== PatientStatus.ARCHIVE && patient.operations.length > 0 && (
            <Button size="sm" variant="secondary" disabled={hasActiveCase} title={hasActiveCase ? "Есть активный ОС" : undefined}
                    loading={action.isPending && action.variables === "archive"} onClick={() => action.mutate("archive")}>
              В архив
            </Button>
          )}
          {canEdit && patient.status === PatientStatus.ARCHIVE && (
            <Button size="sm" variant="secondary" loading={action.isPending && action.variables === "unarchive"}
                    onClick={() => action.mutate("unarchive")}>
              Из архива
            </Button>
          )}
          {isSupervisor && patient.operations.length === 0 && (
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          )}
        </div>
      </div>
      {patient.operations.length > 0 ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {patient.operations.map((operation) => (
            <OperationRow key={operation.id} operation={operation} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">Операционных случаев нет.</p>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Удаление пациента"
        message={`Удалить карточку пациента «${patient.full_name}»? Действие необратимо.`}
        confirmLabel="Удалить"
        danger
        loading={action.isPending}
        onConfirm={() => action.mutate("delete")}
        onClose={() => setConfirmDelete(false)}
      />
    </article>
  )
}

function OperationRow({ operation }: { operation: OperationBrief }) {
  const user = useCurrentUser()
  const canEdit = hasRole(user.role, PATIENT_EDITOR_ROLES)
  const canChangeState = hasRole(user.role, SUPERVISOR_ROLES) || operation.doctor === user.id
  const queryClient = useQueryClient()
  const notify = useToast()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string>()

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["patients"] })
  const cancel = useMutation({
    mutationFn: () => operationsApi.cancel(operation.id, reason.trim()),
    onSuccess: () => {
      notify("Операционный случай отменён")
      setCancelOpen(false)
      setReason("")
      refresh()
    },
    onError: (error) => setReasonError(error instanceof ApiError ? error.field("reason_cancel") ?? error.message : errorMessage(error)),
  })
  const finish = useMutation({
    mutationFn: () => operationsApi.finish(operation.id),
    onSuccess: () => {
      notify("Операционный случай завершён")
      setFinishOpen(false)
      refresh()
    },
    onError: (error) => {
      setFinishOpen(false)
      notify(errorMessage(error), "error")
    },
  })

  const submitCancel = () => {
    if (!reason.trim()) return setReasonError("Укажите причину отмены")
    if (reason.length > 500) return setReasonError("Не более 500 символов")
    setReasonError(undefined)
    cancel.mutate()
  }

  const active = [OperationStatus.ARRIVED, OperationStatus.ON_OPERATION].includes(operation.status)
  const statusInfo = OPERATION_STATUS[operation.status]
  const base = `/operations/${operation.id}`
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">ОС №{operation.id}: {operation.operation_name}</span>
            <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
            <Badge color="violet">{operation.type_operation_name}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(operation.operation_date)} {operation.operation_time && `· поступление ${formatTime(operation.operation_time)}`}
            {operation.pid && ` · PID ${operation.pid}`}
            {operation.diagnosis_name && ` · ${operation.diagnosis_name}`}
          </p>
          <p className="text-sm text-slate-500">
            Врач: {operation.doctor_name ?? "—"} · Медсестра: {operation.nurse_name ?? "—"}
          </p>
          {operation.status === OperationStatus.CANCELLED && operation.reason_cancel && (
            <p className="text-sm text-red-600">Причина отмены: {operation.reason_cancel}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <LinkButton to={`${base}/protocol`} size="sm" variant="secondary">Протокол</LinkButton>
          <LinkButton to={`${base}/card`} size="sm" variant="secondary">Наркозная карта</LinkButton>
          <LinkButton to={`${base}/charts`} size="sm" variant="ghost">Показатели</LinkButton>
          <LinkButton to={`${base}/labs`} size="sm" variant="ghost">Лаб. мониторинг</LinkButton>
          {canEdit && active && <LinkButton to={`${base}/edit`} size="sm" variant="ghost">Изменить ОС</LinkButton>}
          {canChangeState && active && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setFinishOpen(true)}>Завершить</Button>
              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setCancelOpen(true)}>Отменить</Button>
            </>
          )}
        </div>
      </div>
      <Modal
        open={cancelOpen}
        title="Отмена операционного случая"
        onClose={() => setCancelOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Закрыть</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={submitCancel}>Отменить ОС</Button>
          </>
        }
      >
        <Textarea label="Причина отмены" required value={reason} maxLength={500} error={reasonError}
                  onChange={(event) => setReason(event.target.value)} />
      </Modal>
      <ConfirmDialog
        open={finishOpen}
        title="Завершение операционного случая"
        message="Перевести ОС в статус «Завершён»? Карточка пациента будет переведена в архив. Требуется отметка «Окончание анестезии» в наркозной карте."
        confirmLabel="Завершить"
        loading={finish.isPending}
        onConfirm={() => finish.mutate()}
        onClose={() => setFinishOpen(false)}
      />
    </li>
  )
}
