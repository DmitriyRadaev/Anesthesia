import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import type { ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { operationsApi } from "../api/endpoints"
import type { ID } from "../api/types"
import { nameOf, useCatalog } from "../hooks/useCatalog"
import { formatDate } from "../utils/format"

const LINKS = [
  { to: "card", label: "Наркозная карта" },
  { to: "protocol", label: "Протокол анестезии" },
  { to: "labs", label: "Лабораторный мониторинг" },
  { to: "charts", label: "Показатели пациента" },
]

function Info({ label, children, width }: { label: string; children: ReactNode; width?: string }) {
  return (
    <div className="min-w-0" style={width ? { width, maxWidth: width } : undefined}>
      <dt className="text-[13px] text-slate-700/60">{label}</dt>
      <dd className="my-[5px] break-words text-base font-medium text-slate-700">{children ?? "—"}</dd>
    </div>
  )
}

const Divider = () => <div className="border-l border-dashed border-slate-200" aria-hidden="true" />

/** Блок пациента и операционного случая над страницами ОС с навигацией между разделами (как в исходной системе). */
export function OperationHeader({ operationId }: { operationId: ID }) {
  const operation = useQuery({ queryKey: ["operation", String(operationId)], queryFn: () => operationsApi.get(operationId) })
  const sex = useCatalog("sex")
  const op = operation.data
  const age = op ? dayjs().diff(op.patient_info.birthdate, "year") : null
  return (
    <div className="mb-8 print:hidden">
      <section className="rounded-2xl bg-app-page p-5 shadow-app">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="mb-[5px] text-xl font-semibold text-slate-700">{op ? op.patient_info.full_name : "Операционный случай"}</h1>
            {op && <p className="text-[13px] text-slate-700/60">{formatDate(op.patient_info.birthdate)} / {age} лет · ОС №{op.id}</p>}
          </div>
          <NavLink to="/patients" className="rounded-lg border border-[rgba(119,142,239,0.3)] bg-[#f9fcff] px-4 py-1.5 text-sm font-medium text-slate-700">
            ← К реестру пациентов
          </NavLink>
        </header>
        {op && (
          <>
            <dl className="mt-2 flex flex-wrap gap-2.5">
              <Info label="Пол">{nameOf(sex.data, op.patient_info.sex)}</Info>
              <Divider />
              <Info label="Рост">{op.height ? `${Number(op.height)} см.` : "—"}</Info>
              <Divider />
              <Info label="Вес">{op.weight ? `${Number(op.weight)} кг.` : "—"}</Info>
              <Divider />
              <Info label="ИМТ">{op.bmi ?? "—"}</Info>
            </dl>
            <hr className="my-2 border-t border-dashed border-slate-200" />
            <dl className="flex flex-wrap gap-2.5">
              <Info label="Дата операции" width="110px">{formatDate(op.operation_date)}</Info>
              <Divider />
              <Info label="Наименование операции" width="260px">{op.operation_name}</Info>
              <Divider />
              <Info label="Операция" width="95px">{op.type_operation_name}</Info>
              <Divider />
              <Info label="Статус ОС" width="110px">{op.status_display}</Info>
              <Divider />
              <Info label="Анестезиолог-реаниматолог" width="150px">{op.doctor_name}</Info>
              <Divider />
              <Info label="Сестра-анестезист" width="150px">{op.nurse_name}</Info>
            </dl>
          </>
        )}
      </section>
      <nav className="mt-8 grid grid-cols-2 gap-3 rounded-2xl bg-app-page p-5 shadow-app md:grid-cols-4" aria-label="Разделы операционного случая">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={`/operations/${operationId}/${link.to}`}
            end
            className={({ isActive }) =>
              `flex items-center justify-center rounded-lg px-4 py-1.5 text-center text-sm font-medium ${
                isActive ? "bg-app-primary text-white" : "bg-[#eaf0ff] text-slate-700 hover:bg-[#d5e0fc]"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
