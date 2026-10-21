import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ApiError } from "../api/client"
import { patientsApi } from "../api/endpoints"
import type { PatientInput } from "../api/types"
import { Button } from "../components/ui/Button"
import { useUnsavedChanges } from "../components/UnsavedChanges"
import { ErrorAlert, QueryState } from "../components/ui/Feedback"
import { Input, Select } from "../components/ui/Form"
import { Card, PageHeader } from "../components/ui/Misc"
import { useToast } from "../components/ui/Toast"
import { toOptions, useCatalog } from "../hooks/useCatalog"
import { hasErrors, mergeServerErrors, notFutureDate, personName, required, type Errors } from "../utils/validation"

type FormState = Record<keyof PatientInput, string>
const FIELDS = ["surname", "firstname", "lastname", "sex", "birthdate", "blood_group", "blood_rh", "snils", "enp"] as const
const EMPTY: FormState = { surname: "", firstname: "", lastname: "", sex: "", birthdate: "", blood_group: "", blood_rh: "", snils: "", enp: "" }

export function validatePatient(form: FormState): Errors<keyof FormState> {
  return {
    surname: personName(form.surname),
    firstname: personName(form.firstname),
    lastname: personName(form.lastname, false),
    sex: required(form.sex),
    birthdate: notFutureDate(form.birthdate),
    blood_group: required(form.blood_group),
    blood_rh: required(form.blood_rh),
    snils: form.snils && !/^[0-9\s-]+$/.test(form.snils) ? "Допустимы цифры, пробел и дефис" : undefined,
    enp: form.enp && !/^[0-9A-Za-z\s-]+$/.test(form.enp) ? "Допустимы цифры, латиница, пробел и дефис" : undefined,
  }
}

export function PatientFormPage() {
  const { patientId } = useParams()
  const isEdit = Boolean(patientId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const notify = useToast()
  const sex = useCatalog("sex")
  const bloodGroup = useCatalog("blood_group")
  const bloodRh = useCatalog("blood_rh")
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Errors<keyof FormState>>({})
  const [dirty, setDirty] = useState(false)
  useUnsavedChanges(dirty)

  const patient = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => patientsApi.get(Number(patientId)),
    enabled: isEdit,
  })

  useEffect(() => {
    if (patient.data) {
      const p = patient.data
      setForm({
        surname: p.surname, firstname: p.firstname, lastname: p.lastname, sex: String(p.sex), birthdate: p.birthdate,
        blood_group: String(p.blood_group), blood_rh: String(p.blood_rh), snils: p.snils, enp: p.enp,
      })
    }
  }, [patient.data])

  const save = useMutation({
    mutationFn: (data: PatientInput) => (isEdit ? patientsApi.update(Number(patientId), data) : patientsApi.create(data)),
    onSuccess: () => {
      notify(isEdit ? "Карточка пациента сохранена" : "Пациент добавлен")
      queryClient.invalidateQueries({ queryKey: ["patients"] })
      navigate("/patients")
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(mergeServerErrors(FIELDS, error.errors))
    },
  })

  const set = (field: keyof FormState) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setDirty(true)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validatePatient(form)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return
    save.mutate({
      ...form,
      surname: form.surname.trim(),
      firstname: form.firstname.trim(),
      lastname: form.lastname.trim(),
      sex: Number(form.sex),
      blood_group: Number(form.blood_group),
      blood_rh: Number(form.blood_rh),
    })
  }

  const fieldErrorsShown = save.error instanceof ApiError && Object.keys(mergeServerErrors(FIELDS, save.error.errors)).length > 0

  return (
    <div className="max-w-3xl">
      <PageHeader title={isEdit ? "Редактирование карточки пациента" : "Новый пациент"} />
      <QueryState isLoading={isEdit && patient.isLoading} error={patient.error}>
        <Card>
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-3">
            {save.error && !fieldErrorsShown && <div className="sm:col-span-3"><ErrorAlert error={save.error} /></div>}
            <Input label="Фамилия" required value={form.surname} error={errors.surname} onChange={set("surname")} />
            <Input label="Имя" required value={form.firstname} error={errors.firstname} onChange={set("firstname")} />
            <Input label="Отчество" value={form.lastname} error={errors.lastname} onChange={set("lastname")} />
            <Select label="Пол" required placeholder="Выберите" options={toOptions(sex.data)} value={form.sex}
                    error={errors.sex} onChange={set("sex")} />
            <Input label="Дата рождения" type="date" required value={form.birthdate} error={errors.birthdate}
                   onChange={set("birthdate")} />
            <div />
            <Select label="Группа крови" required placeholder="Выберите" options={toOptions(bloodGroup.data)}
                    value={form.blood_group} error={errors.blood_group} onChange={set("blood_group")} />
            <Select label="Резус-фактор" required placeholder="Выберите" options={toOptions(bloodRh.data)}
                    value={form.blood_rh} error={errors.blood_rh} onChange={set("blood_rh")} />
            <div />
            <Input label="СНИЛС" value={form.snils} error={errors.snils} onChange={set("snils")} />
            <Input label="ЕНП (полис)" value={form.enp} error={errors.enp} onChange={set("enp")} />
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" loading={save.isPending}>Сохранить</Button>
              <Button variant="secondary" onClick={() => navigate(-1)}>Отмена</Button>
            </div>
          </form>
        </Card>
      </QueryState>
    </div>
  )
}
