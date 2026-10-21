import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useParams } from "react-router-dom"
import { protocolApi } from "../../api/endpoints"
import type { DoseTotal } from "../../api/types"
import { Button, LinkButton } from "../../components/ui/Button"
import { QueryState } from "../../components/ui/Feedback"
import { formatDate, formatDateTime, formatTime } from "../../utils/format"

interface ProtocolPrint {
  patient_fio: string
  patient_birthdate: string
  anesthesia_types: string
  operation_date: string | null
  operation_time: string | null
  patient_arrived: string | null
  premedication: DoseTotal[]
  introduction: DoseTotal[]
  maintenance: DoseTotal[]
  drugs_total: DoseTotal[]
  is_decurarisation: string | null
  atropine: number | null
  proserine: number | null
  sugammadex: number | null
  effective_breathing: number | string | null
  regaining_consciousness: number | string | null
  extubation: number | string | null
  is_extended_ventilation: string | null
  operation_duration_minutes: number | null
  anesthesia_duration_minutes: number | null
  transferred_to: string | null
  at_start_transportation: string | null
  at_moment_transfer: string | null
  note: string | null
  doctor: string | null
  nurse: string | null
  generated_at: string
}

const doses = (items: DoseTotal[]) => (items.length ? items.map((i) => i.text).join("; ") : "—")
const recovered = (value: number | string | null) => value !== null && value !== "-" && value !== ""

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="mb-1.5">
      <span className="font-medium">{label}</span> {children}
    </p>
  )
}

/** Печатная форма протокола анестезии: формулировки и порядок — как в PDF исходной системы (A4, книжная). */
export function ProtocolPrintPage() {
  const operationId = Number(useParams().operationId)
  const query = useQuery({ queryKey: ["protocol-print", operationId], queryFn: () => protocolApi.get<ProtocolPrint>(operationId, "print") })
  const d = query.data

  return (
    <div className="mx-auto max-w-[210mm]">
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm } }"}</style>
      <div className="mb-4 flex justify-between print:hidden">
        <LinkButton to={`/operations/${operationId}/protocol`} variant="secondary">← К протоколу</LinkButton>
        <Button onClick={() => window.print()}>Печать / сохранить в PDF</Button>
      </div>
      <QueryState isLoading={query.isLoading} error={query.error}>
        {d && (
          <article className="bg-white p-10 text-[12px] leading-snug text-black shadow-app print:p-0 print:shadow-none">
            <p className="text-right text-[10px]">Согласно протоколу ВК №1 от 11.01.2021</p>
            <h1 className="my-4 text-center text-base font-bold">ПРОТОКОЛ АНЕСТЕЗИИ</h1>
            <Line label="ФИО пациента:">{d.patient_fio}</Line>
            <Line label="Дата рождения пациента:">{formatDate(d.patient_birthdate)}</Line>
            <Line label="Вид и метод анестезии:">{d.anesthesia_types || "—"}</Line>
            <p className="mb-1.5">
              <span className="font-medium">Дата:</span> {formatDate(d.operation_date)} <span className="ml-4 font-medium">Время:</span>{" "}
              {d.operation_time ? formatTime(d.operation_time) : "—"}
            </p>
            {d.patient_arrived && <p className="mb-1.5">{d.patient_arrived}</p>}
            <Line label="Премедикация:">{doses(d.premedication)}</Line>
            <Line label="Введение в анестезию:">{doses(d.introduction)}</Line>
            <Line label="Поддержание и особенности течения анестезии:">{doses(d.maintenance)}</Line>
            <p className="mb-1.5">
              <span className="font-medium">Декураризация:</span> {d.is_decurarisation ?? "—"}. <span className="font-medium">Дозы:</span> атропина —{" "}
              {d.atropine ?? "—"} mg, прозерина — {d.proserine ?? "—"} mg{d.sugammadex !== null && `, сугаммадекса — ${d.sugammadex} mg`}
            </p>
            <p className="mb-1.5">
              {recovered(d.effective_breathing)
                ? `Эффективное самостоятельное дыхание /восстановилось: через ${d.effective_breathing} мин. после операции`
                : "Эффективное самостоятельное дыхание не восстановилось"}
            </p>
            <p className="mb-1.5">
              {recovered(d.regaining_consciousness)
                ? `В сознании /Восстановление сознания через ${d.regaining_consciousness} мин. после операции`
                : "Без сознания"}
            </p>
            {recovered(d.extubation) && <p className="mb-1.5">Экстубация через {d.extubation} мин. после операции.</p>}
            <Line label="Пациент на продленной ИВЛ">{d.is_extended_ventilation ?? "—"}</Line>
            <p className="mb-1.5">
              <span className="font-medium">Длительность операции</span> {d.operation_duration_minutes ?? "—"} мин.,{" "}
              <span className="font-medium">анестезии</span> {d.anesthesia_duration_minutes ?? "—"} мин.
            </p>
            <Line label="Пациент передан (ФИО, отделение)">{d.transferred_to ?? "—"}</Line>
            <Line label="Состояние пациента на начало транспортировки:">{d.at_start_transportation ?? "—"}</Line>
            <Line label="Состояние пациента на момент передачи:">{d.at_moment_transfer ?? "—"}</Line>
            <Line label="Примечания:">{d.note || "—"}</Line>
            <p className="mb-1.5 mt-4">Для проведения и поддержания анестезии использованы препараты в суммарной дозе:</p>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-[70%] border border-black px-2 py-1 text-left font-medium">Наименование</th>
                  <th className="border border-black px-2 py-1 text-left font-medium">Доза</th>
                </tr>
              </thead>
              <tbody>
                {d.drugs_total.map((drug) => (
                  <tr key={`${drug.drug}-${drug.unit}`}>
                    <td className="border border-black px-2 py-1">{drug.drug}</td>
                    <td className="border border-black px-2 py-1">{drug.dose} {drug.unit}</td>
                  </tr>
                ))}
                {d.drugs_total.length === 0 && <tr><td className="border border-black px-2 py-1" colSpan={2}>—</td></tr>}
              </tbody>
            </table>
            <div className="mt-10 flex justify-between gap-8">
              <p>Врач-анестезиолог-реаниматолог <span className="ml-2 font-medium">{d.doctor ?? "________________"}</span></p>
              <p>м/с-анестезист <span className="ml-2 font-medium">{d.nurse ?? "________________"}</span></p>
            </div>
            <p className="mt-6 text-[10px] text-slate-500 print:hidden">Сформировано: {formatDateTime(d.generated_at)}</p>
          </article>
        )}
      </QueryState>
    </div>
  )
}
