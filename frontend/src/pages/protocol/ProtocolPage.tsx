import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { cardApi } from "../../api/endpoints"
import type { ID } from "../../api/types"
import { OperationHeader } from "../../components/OperationHeader"
import { Accordion } from "../../components/ui/Accordion"
import { QueryState } from "../../components/ui/Feedback"
import {
  AirwaySection,
  AnesthesiaInfoSection,
  MaintainingSection,
  PatientInfoSection,
  PremedicationSection,
  ReferralSection,
  TransferSection,
  VenousAccessSection,
  VentilatorSection,
} from "./sections"

/** Разделы протокола в порядке исходной системы. */
const CHAPTERS = [
  { id: "patient", title: "Сведения о пациенте" },
  { id: "premedication", title: "Премедикация" },
  { id: "introduction", title: "Введение в анестезию" },
  { id: "maintenance", title: "Поддержание анестезии" },
  { id: "referral", title: "Направление пациента" },
  { id: "drugs", title: "Введенные препараты" },
]

/** «Введенные препараты»: суммарные дозы из наркозной карты (TotalAmountTable исходной системы). */
function DrugTotals({ operationId }: { operationId: ID }) {
  const totals = useQuery({ queryKey: ["card", operationId, "totals"], queryFn: () => cardApi.drugTotals(operationId) })
  return (
    <QueryState isLoading={totals.isLoading} error={totals.error}>
      {totals.data?.length ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-[11px] text-slate-400">
              <th className="border border-slate-200 px-2.5 py-1 text-left font-medium">Препарат</th>
              <th className="border border-slate-200 px-2.5 py-1 text-right font-medium">Суммарная доза</th>
            </tr>
          </thead>
          <tbody>
            {totals.data.map((t) => (
              <tr key={`${t.drug}-${t.unit}`} className="bg-app-input">
                <td className="border border-slate-200 px-2.5 py-2.5 text-slate-700">{t.drug}</td>
                <td className="border border-slate-200 px-2.5 py-2.5 text-right font-medium text-slate-700">{t.dose} {t.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-400">Препараты в наркозной карте не вводились.</p>
      )}
    </QueryState>
  )
}

export function ProtocolPage() {
  const operationId = Number(useParams().operationId)
  return (
    <div>
      <OperationHeader operationId={operationId} />
      <div className="flex items-start gap-6">
        <nav className="sticky top-6 hidden w-56 shrink-0 rounded-2xl bg-app-page p-5 shadow-app xl:block print:hidden" aria-label="Разделы протокола">
          <ul className="space-y-3 text-sm font-medium text-slate-700">
            {CHAPTERS.map((chapter) => (
              <li key={chapter.id}>
                <a href={`#${chapter.id}`} className="border-b border-dashed border-slate-400 hover:text-slate-900">{chapter.title}</a>
              </li>
            ))}
          </ul>
          <Link to={`/operations/${operationId}/protocol/print`}
                className="mt-6 flex h-[38px] items-center justify-center rounded-[20px] bg-app-primary text-sm font-medium text-white shadow-button">
            Печатная форма
          </Link>
        </nav>
        <div className="min-w-0 flex-1 rounded-2xl bg-app-page p-5 shadow-app">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium text-slate-700">Протокол анестезии</h1>
            <Link to={`/operations/${operationId}/protocol/print`} className="text-sm font-medium text-slate-700 hover:underline xl:hidden">
              Печатная форма
            </Link>
          </div>
          <Accordion id="patient" level="main" title="Сведения о пациенте" defaultOpen>
            <PatientInfoSection operationId={operationId} />
          </Accordion>
          <Accordion id="premedication" level="main" title="Премедикация">
            <PremedicationSection operationId={operationId} />
          </Accordion>
          <Accordion id="introduction" level="main" title="Введение в анестезию">
            <AnesthesiaInfoSection operationId={operationId} />
            <VenousAccessSection operationId={operationId} />
            <AirwaySection operationId={operationId} />
          </Accordion>
          <Accordion id="maintenance" level="main" title="Поддержание анестезии">
            <MaintainingSection operationId={operationId} />
            <VentilatorSection operationId={operationId} />
          </Accordion>
          <Accordion id="referral" level="main" title="Направление пациента">
            <TransferSection operationId={operationId} />
            <ReferralSection operationId={operationId} />
          </Accordion>
          <Accordion id="drugs" level="main" title="Введенные препараты">
            <DrugTotals operationId={operationId} />
          </Accordion>
        </div>
      </div>
    </div>
  )
}
