import { useQuery } from "@tanstack/react-query"
import { cardApi } from "../../api/endpoints"
import type { CatalogItem, DrugSection, ID } from "../../api/types"
import { Button } from "../../components/ui/Button"
import { Checkbox, Input, Select, Textarea } from "../../components/ui/Form"
import { useCatalog } from "../../hooks/useCatalog"
import { formatDate, formatDateTime } from "../../utils/format"
import { CatalogSelect, fieldError, numOrNull, Section, str, useFormFrom, useProtocolBlock, YesNo } from "./common"

type Data = Record<string, unknown>

// --- сведения о пациенте ----------------------------------------------------------------------

export function PatientInfoSection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "patient-info", "patch")
  const { form, set } = useFormFrom(query.data, (d) => ({
    complaints_patient: d.complaints_patient, features_anamnesis: d.features_anamnesis, height: str(d.height), weight: str(d.weight),
  }))
  const d = query.data ?? {}
  return (
    <Section title="Пациент" isLoading={query.isLoading} loadError={query.error} saving={save.isPending} saveError={save.error}
             onSave={() => save.mutate({ ...form, height: numOrNull(str(form.height)), weight: numOrNull(str(form.weight)) })}>
      <p className="mb-3 text-sm text-slate-600">
        {str(d.surname)} {str(d.firstname)} {str(d.lastname)}, {formatDate(d.birthdate as string)} · Операция: {str(d.operation_name)}
        {d.diagnosis_name ? ` · Диагноз: ${str(d.diagnosis_name)}` : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Рост, см" value={str(form.height)} error={fieldError(save.error, "height")} onChange={(e) => set("height", e.target.value)} />
        <Input label="Вес, кг" value={str(form.weight)} error={fieldError(save.error, "weight")} onChange={(e) => set("weight", e.target.value)} />
        <Input label="ИМТ" value={str(d.bmi)} disabled />
        <Textarea label="Жалобы пациента" wrapperClassName="sm:col-span-3" value={str(form.complaints_patient)}
                  onChange={(e) => set("complaints_patient", e.target.value)} />
        <Textarea label="Особенности анамнеза" wrapperClassName="sm:col-span-3" value={str(form.features_anamnesis)}
                  onChange={(e) => set("features_anamnesis", e.target.value)} />
      </div>
    </Section>
  )
}

// --- сведения об анестезии --------------------------------------------------------------------

export function AnesthesiaInfoSection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "information-anesthesia")
  const methods = useCatalog("anesthesia_method")
  const { form, set } = useFormFrom(query.data, (d) => ({ anesthesia_methods: d.anesthesia_methods, patient_arrived: d.patient_arrived }))
  const selected = (form.anesthesia_methods as number[] | undefined) ?? []
  const toggle = (id: number) => set("anesthesia_methods", selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const group = (kind: string, title: string) => (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{title}</legend>
      <div className="flex flex-col gap-1.5">
        {(methods.data ?? []).filter((m: CatalogItem) => m.type === kind).map((m) => (
          <Checkbox key={m.id} label={m.name} checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
        ))}
      </div>
    </fieldset>
  )
  return (
    <Section title="Сведения об анестезии" isLoading={query.isLoading} loadError={query.error} saving={save.isPending}
             saveError={save.error} onSave={() => save.mutate(form)}>
      <div className="grid gap-4 sm:grid-cols-3">
        {group("GENERAL", "Общая анестезия")}
        {group("LOCAL", "Местная анестезия")}
        <div className="space-y-2 text-sm">
          <p><span className="text-slate-500">Дата поступления:</span> {formatDate(query.data?.date_arrival as string)}</p>
          <p><span className="text-slate-500">Начало анестезии:</span> {formatDateTime(query.data?.time_anesthesia_start as string)}</p>
          <p className="text-xs text-slate-400">Время начала анестезии задаётся в наркозной карте («Анестезиологические действия»).</p>
        </div>
      </div>
      <div className="mt-4">
        <Checkbox
          label="Пациент доставлен в операционную. Начат мониторинг основных витальных функций (АД, ЧСС, SpO2, внешнее дыхание, ЭКГ). Обеспечен венозный доступ"
          checked={form.patient_arrived === true}
          onChange={(e) => set("patient_arrived", e.target.checked)}
        />
      </div>
    </Section>
  )
}

// --- венозный доступ -------------------------------------------------------------------------

type Row = Record<string, unknown>

function VenousTable({ operationId, kind }: { operationId: ID; kind: "pvc" | "cvc" }) {
  const { query, save } = useProtocolBlock<Row[]>(operationId, `venous-access/${kind}`)
  const { form, setForm } = useFormFrom(query.data, (rows) => ({ rows: rows.map(({ id: _id, ...rest }) => rest) }))
  const rows = (form.rows as Row[] | undefined) ?? []
  const update = (index: number, field: string, value: unknown) =>
    setForm({ rows: rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)) })
  const isCVC = kind === "cvc"
  return (
    <Section title={isCVC ? "Венозный доступ: центральный катетер (ЦВК)" : "Венозный доступ: периферический катетер (ПВК)"}
             isLoading={query.isLoading} loadError={query.error} saving={save.isPending} saveError={save.error}
             onSave={() => save.mutate(rows)}>
      {rows.length === 0 && <p className="mb-3 text-sm text-slate-500">Катетеры не указаны.</p>}
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-6">
            <CatalogSelect slug={isCVC ? "vein_cvc" : "vein_pvc"} label="Вена" value={row.vein}
                           error={fieldError(save.error, `${index}.vein`)} onChange={(v) => update(index, "vein", v)} />
            <Select label="Сторона" placeholder="—" value={str(row.arm)}
                    options={[{ value: "L", label: "Левая" }, { value: "R", label: "Правая" }]}
                    onChange={(e) => update(index, "arm", e.target.value)} />
            {isCVC && <CatalogSelect slug="catheter_type" label="Тип катетера" value={row.catheter_type} onChange={(v) => update(index, "catheter_type", v)} />}
            <CatalogSelect slug="catheter_diameter" label={isCVC ? "Просвет 1" : "Диаметр"} value={row.catheter_diameter_1}
                           onChange={(v) => update(index, "catheter_diameter_1", v)} />
            {isCVC && <CatalogSelect slug="catheter_diameter" label="Просвет 2" value={row.catheter_diameter_2} onChange={(v) => update(index, "catheter_diameter_2", v)} />}
            {isCVC && <CatalogSelect slug="catheter_diameter" label="Просвет 3" value={row.catheter_diameter_3} onChange={(v) => update(index, "catheter_diameter_3", v)} />}
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setForm({ rows: rows.filter((_, i) => i !== index) })}>
              Удалить
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="secondary" className="mt-3" onClick={() => setForm({ rows: [...rows, { vein: null, arm: "" }] })}>
        + Добавить катетер
      </Button>
    </Section>
  )
}

export const VenousAccessSection = ({ operationId }: { operationId: ID }) => (
  <>
    <VenousTable operationId={operationId} kind="pvc" />
    <VenousTable operationId={operationId} kind="cvc" />
  </>
)

// --- препараты из наркозной карты (только чтение) -------------------------------------------

function CardDrugs({ operationId, section }: { operationId: ID; section: DrugSection }) {
  const drugs = useQuery({ queryKey: ["card", operationId, "drugs", section], queryFn: () => cardApi.drugs(operationId, section) })
  const units = useCatalog("measurement_units")
  if (!drugs.data?.length) return <p className="mt-3 text-xs text-slate-400">Препараты в наркозной карте не указаны.</p>
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
      <p className="mb-1 text-xs font-medium uppercase text-slate-500">Препараты (из наркозной карты)</p>
      {drugs.data.map((group) => (
        <p key={group.drug}>
          <span className="font-medium">{group.drug}:</span>{" "}
          {group.items.map((i) => `${i.dose} ${units.data?.find((u) => u.id === i.measurement_unit)?.name ?? ""}`).join(", ")}
        </p>
      ))}
    </div>
  )
}

// --- премедикация -----------------------------------------------------------------------------

export function PremedicationSection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "premedication")
  const { form, set } = useFormFrom(query.data, (d) => ({ ...d }))
  return (
    <Section title="Премедикация" isLoading={query.isLoading} loadError={query.error} saving={save.isPending}
             saveError={save.error} onSave={() => save.mutate(form)} extra={<CardDrugs operationId={operationId} section="premedication" />}>
      <div className="grid gap-3 sm:grid-cols-3">
        <CatalogSelect slug="oxygen_mask_size" label="Размер кислородной маски" value={form.oxygen_mask_size} onChange={(v) => set("oxygen_mask_size", v)} />
        <YesNo label="Инсуффляция кислорода" value={form.is_oxygen_insufflation} onChange={(v) => set("is_oxygen_insufflation", v)} />
        <YesNo label="Тампонада глотки" value={form.pharynx_tamponade} onChange={(v) => set("pharynx_tamponade", v)} />
        <div className="sm:col-span-3">
          <CatalogSelect slug="rass" label="Шкала RASS" value={form.rass} onChange={(v) => set("rass", v)} />
        </div>
        <Textarea label="Примечание" wrapperClassName="sm:col-span-3" value={str(form.note)} onChange={(e) => set("note", e.target.value)} />
      </div>
    </Section>
  )
}

// --- проходимость дыхательных путей ------------------------------------------------------------

interface Sanation { type: string; catheter?: string; comment?: string }

export function AirwaySection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "airway")
  const { form, set } = useFormFrom(query.data, (d) => ({ ...d }))
  const nested = (key: string) => (form[key] as Record<string, unknown> | undefined) ?? {}
  const setNested = (key: string, field: string, value: unknown) => set(key, { ...nested(key), [field]: value })
  const sanacia = (form.sanacia as Sanation[] | undefined) ?? []
  const sanation = (type: string) => sanacia.find((s) => s.type === type)
  const toggleSanation = (type: string, enabled: boolean) =>
    set("sanacia", enabled ? [...sanacia, { type, catheter: "", comment: "" }] : sanacia.filter((s) => s.type !== type))
  const updateSanation = (type: string, field: "catheter" | "comment", value: string) =>
    set("sanacia", sanacia.map((s) => (s.type === type ? { ...s, [field]: value } : s)))
  const tubeSizes = useCatalog("intubation_tube_size")
  const sizeOptions = (tubeSizes.data ?? []).map((s) => ({ value: s.id, label: s.name }))
  const sizeSelect = (key: string, label: string) => (
    <Select label={label} placeholder="—" options={sizeOptions} value={str(nested(key).size_id)}
            onChange={(e) => setNested(key, "size_id", e.target.value ? Number(e.target.value) : null)} />
  )

  return (
    <Section title="Обеспечение проходимости и защиты верхних дыхательных путей" isLoading={query.isLoading}
             loadError={query.error} saving={save.isPending} saveError={save.error}
             onSave={() => save.mutate({ ...form, attempts: numOrNull(str(form.attempts)) })}>
      <div className="grid gap-3 sm:grid-cols-4">
        <YesNo label="Трубка установлена" value={form.tube_installed} onChange={(v) => set("tube_installed", v)} />
        <Input label="Количество попыток" inputMode="numeric" value={str(form.attempts)}
               error={fieldError(save.error, "attempts")} onChange={(e) => set("attempts", e.target.value)} />
        <Select label="Метод интубации" placeholder="—" value={str(form.intubation_method)}
                error={fieldError(save.error, "intubation_method")}
                options={[{ value: "INTUBOSCOPY", label: "Интубоскопия" }, { value: "TRACHEOSTOMY", label: "Трахеостомия" },
                  { value: "CONICOTOMY", label: "Коникотомия" }]}
                onChange={(e) => set("intubation_method", e.target.value)} />
        <div />
        <Checkbox label="Пищеводный обтуратор (ларингеальная трубка)" className="sm:col-span-2"
                  checked={nested("laryngeal_tube").is_installed === true}
                  onChange={(e) => setNested("laryngeal_tube", "is_installed", e.target.checked)} />
        {sizeSelect("laryngeal_tube", "Размер обтуратора")}
        <div />
        <Select label="Интубационная трубка" placeholder="—" value={str(nested("intubation_tube").type)}
                options={[{ value: "OROTRACHEAL", label: "Оротрахеальная" }, { value: "NASOTRACHEAL", label: "Назотрахеальная" }]}
                onChange={(e) => setNested("intubation_tube", "type", e.target.value)} />
        <Select label="Манжета низкого давления" placeholder="—" value={str(nested("intubation_tube").cuff)}
                options={[{ value: "true", label: "С манжетой" }, { value: "false", label: "Без манжеты" }]}
                onChange={(e) => setNested("intubation_tube", "cuff", e.target.value === "" ? null : e.target.value === "true")} />
        {sizeSelect("intubation_tube", "Размер трубки")}
        <div />
        <Select label="Эндобронхиальная двухпросветная" placeholder="—" value={str(nested("endobronchial_tube").type)}
                error={fieldError(save.error, "endobronchial_tube.type")}
                options={[{ value: "L", label: "Левосторонняя" }, { value: "R", label: "Правосторонняя" }]}
                onChange={(e) => setNested("endobronchial_tube", "type", e.target.value)} />
        {sizeSelect("endobronchial_tube", "Размер")}
        <Select label="Ларингоскопия" placeholder="—" value={str(nested("laryngoscopy").type)}
                options={[{ value: "DL", label: "Прямая" }, { value: "VL", label: "Изогнутая" }, { value: "VP", label: "С подвижным наконечником" }]}
                onChange={(e) => setNested("laryngoscopy", "type", e.target.value)} />
        <CatalogSelect slug="blade_type" label="Тип клинка" value={nested("laryngoscopy").blade_type_id}
                       onChange={(v) => setNested("laryngoscopy", "blade_type_id", v)} />
      </div>
      <fieldset className="mt-4 grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium text-slate-700">Санация</legend>
        {[["OROPHARYNX", "Ротоглотки (катетер)"], ["TBD", "ТБД (катетер)"], ["FBS", "ФБС (комментарий)"]].map(([type, label]) => (
          <div key={type} className="space-y-2">
            <Checkbox label={label.split(" (")[0]} checked={Boolean(sanation(type))} onChange={(e) => toggleSanation(type, e.target.checked)} />
            {sanation(type) && (
              <Input label={label} value={str(type === "FBS" ? sanation(type)?.comment : sanation(type)?.catheter)}
                     onChange={(e) => updateSanation(type, type === "FBS" ? "comment" : "catheter", e.target.value)} />
            )}
          </div>
        ))}
      </fieldset>
    </Section>
  )
}

// --- поддержание анестезии ----------------------------------------------------------------------

export function MaintainingSection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "maintaining-anesthesia")
  const { form, set } = useFormFrom(query.data, (d) => ({ ...d }))
  return (
    <Section title="Поддержание и особенности течения анестезии" isLoading={query.isLoading} loadError={query.error}
             saving={save.isPending} saveError={save.error}
             onSave={() => save.mutate({ ...form, index_bis: numOrNull(str(form.index_bis)), option_mg: numOrNull(str(form.option_mg)) })}
             extra={<CardDrugs operationId={operationId} section="maintenance" />}>
      <div className="grid gap-3 sm:grid-cols-3">
        <CatalogSelect slug="anesthesia_specificity" label="Особенности анестезии" value={form.anesthesia_specificity}
                       onChange={(v) => set("anesthesia_specificity", v)} />
        <Input label="Индекс BIS" inputMode="decimal" value={str(form.index_bis)} error={fieldError(save.error, "index_bis")}
               onChange={(e) => set("index_bis", e.target.value)} />
        <CatalogSelect slug="anesthesia_type" label="Вид регионарной анестезии" value={form.anesthesia_type}
                       onChange={(v) => set("anesthesia_type", v)} />
        <CatalogSelect slug="oropharyngeal_catheter" label="Орофарингеальный катетер" value={form.oropharyngeal_catheter}
                       onChange={(v) => set("oropharyngeal_catheter", v)} />
        <Input label="Доза, мг" inputMode="numeric" value={str(form.option_mg)} error={fieldError(save.error, "option_mg")}
               onChange={(e) => set("option_mg", e.target.value)} />
        <YesNo label="Симптоматическая терапия" value={form.symptomatic_picked} onChange={(v) => set("symptomatic_picked", v)} />
        {form.symptomatic_picked === true && (
          <Textarea label="Симптоматическая терапия: описание" wrapperClassName="sm:col-span-3" value={str(form.symptomatic_option)}
                    onChange={(e) => set("symptomatic_option", e.target.value)} />
        )}
      </div>
    </Section>
  )
}

// --- аппарат ИВЛ ------------------------------------------------------------------------------

export function VentilatorSection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "ventilator")
  const { form, set } = useFormFrom(query.data, (d) => ({ ...d }))
  return (
    <Section title="Аппарат ИВЛ (НДА), мониторинг, примечание" isLoading={query.isLoading} loadError={query.error}
             saving={save.isPending} saveError={save.error}
             onSave={() => save.mutate({ ...form, chamber: numOrNull(str(form.chamber)), bed: numOrNull(str(form.bed)),
               patient_status_value: numOrNull(str(form.patient_status_value)) })}>
      <div className="grid gap-3 sm:grid-cols-3">
        <CatalogSelect slug="ventilator" label="Аппарат ИВЛ" value={form.ventilator} onChange={(v) => set("ventilator", v)} />
        <CatalogSelect slug="monitoring" label="Монитор" value={form.monitoring} onChange={(v) => set("monitoring", v)} />
        <CatalogSelect slug="patient_status" label="Состояние пациента" value={form.patient_status} onChange={(v) => set("patient_status", v)} />
        <Input label="Через, мин" inputMode="numeric" value={str(form.patient_status_value)}
               error={fieldError(save.error, "patient_status_value")} onChange={(e) => set("patient_status_value", e.target.value)} />
        <Input label="Палата" inputMode="numeric" value={str(form.chamber)} error={fieldError(save.error, "chamber")}
               onChange={(e) => set("chamber", e.target.value)} />
        <Input label="Койка" inputMode="numeric" value={str(form.bed)} error={fieldError(save.error, "bed")}
               onChange={(e) => set("bed", e.target.value)} />
        <Textarea label="Примечание" wrapperClassName="sm:col-span-3" value={str(form.note)} onChange={(e) => set("note", e.target.value)} />
      </div>
    </Section>
  )
}

// --- пациент передан ----------------------------------------------------------------------------

function ScaleSelector({ slug, headSlug, value, onChange }: { slug: string; headSlug: string; value: unknown; onChange: (v: Record<string, number>) => void }) {
  const heads = useCatalog(headSlug)
  const items = useCatalog(slug)
  const selection = (value as Record<string, number> | null) ?? {}
  const total = Object.entries(selection).reduce((sum, [, id]) => {
    const item = items.data?.find((i) => i.id === Number(id))
    return sum + (item?.value ? Number(item.value) : 0)
  }, 0)
  return (
    <div className="space-y-2">
      {(heads.data ?? []).map((head) => (
        <Select key={head.id} label={head.name} placeholder="—" value={str(selection[String(head.id)])}
                options={(items.data ?? []).filter((i) => i.head === head.id).map((i) => ({ value: i.id, label: `${i.value} — ${i.name}` }))}
                onChange={(e) => {
                  const next = { ...selection }
                  if (e.target.value) next[String(head.id)] = Number(e.target.value)
                  else delete next[String(head.id)]
                  onChange(next)
                }} />
      ))}
      <p className="text-sm text-slate-600">Сумма баллов: <b>{total}</b></p>
    </div>
  )
}

const VITALS: Array<[string, string]> = [["ad", "АДн, мм рт.ст."], ["ps", "Ps, в мин"], ["spo2", "SpO₂, %"], ["breath_rate", "ЧД, в мин"], ["cvp", "ЦВД, см вод.ст."]]
const NUMERIC_TRANSFER = ["b_ad", "b_ps", "b_spo2", "b_breath_rate", "b_cvp", "t_ad", "t_ps", "t_spo2", "t_breath_rate", "t_cvp",
  "atropine", "proserine", "sugammadex", "effective_breathing", "regaining_consciousness", "extubation"]

export function TransferSection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "patient-transferred")
  const { form, set } = useFormFrom(query.data, ({ operation_duration: _d, ...d }) => d)
  const submit = () => {
    const payload: Data = { ...form }
    for (const key of NUMERIC_TRANSFER) payload[key] = numOrNull(str(form[key]))
    for (const key of ["b_time", "t_time"]) payload[key] = form[key] ? str(form[key]).slice(0, 5) : null
    save.mutate(payload)
  }
  const condition = (prefix: "b" | "t", title: string) => (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="mb-2 text-sm font-medium text-slate-700">{title}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Время" type="time" value={str(form[`${prefix}_time`]).slice(0, 5)} onChange={(e) => set(`${prefix}_time`, e.target.value)} />
        {VITALS.map(([key, label]) => (
          <Input key={key} label={label} inputMode="decimal" value={str(form[`${prefix}_${key}`])}
                 error={fieldError(save.error, `${prefix}_${key}`)} onChange={(e) => set(`${prefix}_${key}`, e.target.value)} />
        ))}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div><p className="mb-1 text-xs font-medium uppercase text-slate-500">Шкала Глазго</p>
          <ScaleSelector slug="scale_glazgo" headSlug="scale_glazgo_head" value={form[`${prefix}_scale_glazgo`]}
                         onChange={(v) => set(`${prefix}_scale_glazgo`, v)} /></div>
        <div><p className="mb-1 text-xs font-medium uppercase text-slate-500">Шкала FOUR (Мейо)</p>
          <ScaleSelector slug="scale_meyo" headSlug="scale_meyo_head" value={form[`${prefix}_scale_meyo`]}
                         onChange={(v) => set(`${prefix}_scale_meyo`, v)} /></div>
      </div>
    </div>
  )
  const withMinutes = (flag: string, field: string, label: string) => (
    <div className="space-y-2">
      <YesNo label={label} value={form[flag]} onChange={(v) => set(flag, v)} />
      {form[flag] === true && (
        <Input label="через, мин" inputMode="decimal" value={str(form[field])} onChange={(e) => set(field, e.target.value)} />
      )}
    </div>
  )
  return (
    <Section title="Пациент передан" isLoading={query.isLoading} loadError={query.error} saving={save.isPending}
             saveError={save.error} onSave={submit}>
      <p className="mb-3 text-sm text-slate-600">
        Длительность операции (разрез → ушивание): <b>{str(query.data?.operation_duration) || "—"}</b>
      </p>
      <div className="space-y-3">
        {condition("b", "Состояние на начало транспортировки")}
        {condition("t", "Состояние на момент передачи")}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <YesNo label="Декураризация" value={form.is_decurarisation} onChange={(v) => set("is_decurarisation", v)} />
        <Input label="Атропин, мг" inputMode="decimal" value={str(form.atropine)} onChange={(e) => set("atropine", e.target.value)} />
        <Input label="Прозерин, мг" inputMode="decimal" value={str(form.proserine)} onChange={(e) => set("proserine", e.target.value)} />
        <Input label="Сугаммадекс, мг" inputMode="decimal" value={str(form.sugammadex)} onChange={(e) => set("sugammadex", e.target.value)} />
        {withMinutes("is_effective_breathing", "effective_breathing", "Эффективное самостоятельное дыхание")}
        {withMinutes("is_regaining_consciousness", "regaining_consciousness", "Восстановление сознания")}
        {withMinutes("is_extubation", "extubation", "Экстубация")}
        <YesNo label="Пациент на продлённой ИВЛ" value={form.is_extended_ventilation} onChange={(v) => set("is_extended_ventilation", v)} />
        <YesNo label="Летальный исход" value={form.is_died} onChange={(v) => set("is_died", v)} />
      </div>
    </Section>
  )
}

// --- направление пациента -----------------------------------------------------------------------

export function ReferralSection({ operationId }: { operationId: ID }) {
  const { query, save } = useProtocolBlock<Data>(operationId, "redirecting-patient")
  const { form, set, setForm } = useFormFrom(query.data, (d) => ({ ...d }))
  const doctors = useCatalog("doctor_fio")
  return (
    <Section title="Направление пациента после операции" isLoading={query.isLoading} loadError={query.error}
             saving={save.isPending} saveError={save.error} onSave={() => save.mutate(form)}>
      <div className="grid gap-3 sm:grid-cols-3">
        <CatalogSelect slug="department_type" label="Тип отделения" value={form.department_type}
                       onChange={(v) => setForm({ ...form, department_type: v, department: null })} />
        <CatalogSelect slug="department" label="Отделение" value={form.department}
                       params={form.department_type ? { department_type_id: Number(form.department_type) } : undefined}
                       enabled={Boolean(form.department_type)} error={fieldError(save.error, "department")}
                       onChange={(v) => set("department", v)} />
        <div>
          <Input label="ФИО принимающего врача" list="doctor-fio" value={str(form.doctor_fio)} onChange={(e) => set("doctor_fio", e.target.value)} />
          <datalist id="doctor-fio">
            {(doctors.data ?? []).map((d) => <option key={d.id} value={d.name} />)}
          </datalist>
        </div>
      </div>
    </Section>
  )
}
