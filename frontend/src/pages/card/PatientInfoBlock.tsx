import type { CardPatientInfo } from "../../api/types"
import { nameOf, toOptions, useCatalog } from "../../hooks/useCatalog"
import { AnesInput, AnesSelect } from "./cardUi"

export type InfoForm = Record<
  "type_operation" | "asa" | "volume_operation" | "department" | "ventilator" | "monitoring" |
  "operation_name" | "diagnosis_name" | "drug_intolerance" | "height" | "weight" | "pid" | "operation_date" | "operation_time",
  string
>

export const toInfoForm = (d: CardPatientInfo): InfoForm => ({
  type_operation: String(d.type_operation ?? ""), asa: String(d.asa ?? ""), volume_operation: String(d.volume_operation ?? ""),
  department: String(d.department ?? ""), ventilator: String(d.ventilator ?? ""), monitoring: String(d.monitoring ?? ""),
  operation_name: d.operation_name ?? "", diagnosis_name: d.diagnosis_name ?? "", drug_intolerance: d.drug_intolerance ?? "",
  height: d.height ?? "", weight: d.weight ?? "", pid: d.pid ?? "",
  operation_date: d.operation_date ?? "", operation_time: d.operation_time?.slice(0, 5) ?? "",
})

const REQUIRED: Array<keyof InfoForm> = ["operation_name", "asa", "volume_operation", "department", "type_operation", "ventilator", "monitoring", "pid"]

/** Проверки полей как в исходной системе: обязательные поля, рост и вес — числа от 1 до 300. */
export function validateInfo(form: InfoForm): Partial<Record<keyof InfoForm, string>> {
  const errors: Partial<Record<keyof InfoForm, string>> = {}
  REQUIRED.forEach((key) => {
    if (!form[key].trim()) errors[key] = "Обязательное поле"
  })
  for (const key of ["height", "weight"] as const) {
    const raw = form[key].trim()
    if (!raw) continue
    const value = Number(raw.replace(",", "."))
    if (!/^\d+([.,]\d+)?$/.test(raw)) errors[key] = "Только числа"
    else if (value < 1 || value > 300) errors[key] = "Значение от 1 до 300"
  }
  return errors
}

/** ИМТ с описанием, как в исходной системе (calculateBMI). */
export function calculateBMI(height: string, weight: string): string {
  const h = Number(height.replace(",", ".")) / 100
  const w = Number(weight.replace(",", "."))
  const bmi = w / (h * h)
  if (!Number.isFinite(bmi) || bmi <= 0) return ""
  const description =
    bmi < 18.5 ? "недостаточная" : bmi < 25 ? "нормальная" : bmi < 30 ? "избыточная" : bmi < 35 ? "ожирение I" : bmi < 40 ? "ожирение II" : "ожирение III"
  return `${bmi.toFixed(1)} - ${description}`
}

function InfoIcon({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#5068a5" d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
      </svg>
    </button>
  )
}

interface Props {
  info: CardPatientInfo
  form: InfoForm
  errors: Partial<Record<keyof InfoForm, string>>
  onChange: (key: keyof InfoForm, value: string) => void
  arrivalLocked: boolean
  anesthesiaEnd: string
  onArrivalInfo: () => void
  onEndInfo: () => void
}

export function PatientInfoBlock({ info, form, errors, onChange, arrivalLocked, anesthesiaEnd, onArrivalInfo, onEndInfo }: Props) {
  const blood = useCatalog("blood_group")
  const rh = useCatalog("blood_rh")
  const asa = useCatalog("asa")
  const volume = useCatalog("volume_operation")
  const departments = useCatalog("department", { department_type_id: 1 })
  const urgency = useCatalog("type_operation")
  const ventilators = useCatalog("ventilator")
  const monitoring = useCatalog("monitoring")
  const select = (key: keyof InfoForm) => ({ value: form[key], error: errors[key], onChange: (e: { target: { value: string } }) => onChange(key, e.target.value) })
  const input = (key: keyof InfoForm) => ({ value: form[key], error: errors[key], onChange: (e: { target: { value: string } }) => onChange(key, e.target.value) })

  return (
    <div className="card-patientinfo">
      <h3 className="text-base text-[#91a0c6]">Сведения о пациенте:</h3>
      <hr className="anes-delimiter" />
      <div className="card-grid">
        <AnesInput className="[grid-area:A]" label="Фамилия:" value={info.surname ?? ""} disabled />
        <AnesInput className="[grid-area:B]" label="Имя:" value={info.firstname ?? ""} disabled />
        <AnesInput className="[grid-area:C]" label="Отчество:" value={info.lastname ?? ""} disabled />
        <AnesInput className="[grid-area:W]" label="Диагноз:" placeholder="Введите диагноз" maxLength={255} {...input("diagnosis_name")} />
        <AnesInput className="[grid-area:X]" label="Наименование операции:" placeholder="Введите наименование операции" maxLength={255} {...input("operation_name")} />
        <AnesInput className="[grid-area:U]" label="Рост:" placeholder="Введите" adornment="см" inputMode="decimal" {...input("height")} />
        <AnesInput className="[grid-area:V]" label="Вес:" placeholder="Введите" adornment="кг" inputMode="decimal" {...input("weight")} />
        <AnesInput className="[grid-area:R]" label="ИМТ:" value={calculateBMI(form.height, form.weight)} readOnly />
        <AnesSelect className="[grid-area:P]" label="Операция:" options={toOptions(urgency.data)} {...select("type_operation")} />
        <AnesSelect className="[grid-area:D]" label="Rh:" placeholder="—" options={toOptions(rh.data)} value={String(info.blood_rh ?? "")} disabled
                    title={nameOf(rh.data, info.blood_rh)} />
        <AnesSelect className="[grid-area:E]" label="Группа крови:" placeholder="—" options={toOptions(blood.data)} value={String(info.blood_group ?? "")} disabled />
        <AnesSelect className="[grid-area:F]" label="Риск по ASA:" placeholder="Введите" options={toOptions(asa.data)} {...select("asa")} />
        <AnesSelect className="[grid-area:G]" label="По объему операции:" placeholder="Введите" options={toOptions(volume.data)} {...select("volume_operation")} />
        <AnesInput className="[grid-area:K]" type="date" label="Дата операции:" disabled={arrivalLocked} {...input("operation_date")} />
        <AnesInput className="[grid-area:L]" type="time" label="Время поступления" disabled={arrivalLocked} data-testid="timeArrival"
                   adornment={<InfoIcon label="О редактировании времени поступления" onClick={onArrivalInfo} />} {...input("operation_time")} />
        <AnesInput className="[grid-area:M]" label="Время завершения анестезии" placeholder="чч.мм" value={anesthesiaEnd} disabled
                   adornment={<InfoIcon label="Как указать время завершения анестезии" onClick={onEndInfo} />} />
        <AnesSelect className="[grid-area:N]" label="Отделение:" options={toOptions(departments.data)} {...select("department")} />
        <div className="[grid-area:O]">
          <label className="anes-label" htmlFor="drug-intolerance">Непереносимость препаратов:</label>
          <textarea id="drug-intolerance" className="anes-input" style={{ height: 95 }} placeholder="Введите названия" maxLength={400}
                    value={form.drug_intolerance} onChange={(e) => onChange("drug_intolerance", e.target.value)} />
        </div>
        <AnesSelect className="[grid-area:S]" label="Аппарат ИВЛ (НДА):" options={toOptions(ventilators.data)} {...select("ventilator")} />
        <AnesSelect className="[grid-area:T]" label="Мониторинг" options={toOptions(monitoring.data)} {...select("monitoring")} />
        <AnesInput className="[grid-area:Z]" label="PID:" placeholder="Введите" maxLength={64} {...input("pid")} />
      </div>
    </div>
  )
}
