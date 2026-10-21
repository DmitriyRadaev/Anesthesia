import { useMutation } from "@tanstack/react-query"
import dayjs from "dayjs"
import { useState, type FormEvent } from "react"
import { reportsApi } from "../api/endpoints"
import { Button } from "../components/ui/Button"
import { ErrorAlert } from "../components/ui/Feedback"
import { Input } from "../components/ui/Form"
import { Card, PageHeader } from "../components/ui/Misc"
import { useToast } from "../components/ui/Toast"
import { formatDate } from "../utils/format"

export function ReportsPage() {
  const notify = useToast()
  const [dateStart, setDateStart] = useState(dayjs().startOf("month").format("YYYY-MM-DD"))
  const [dateEnd, setDateEnd] = useState(dayjs().format("YYYY-MM-DD"))
  const [periodError, setPeriodError] = useState<string>()
  const report = useMutation({ mutationFn: () => reportsApi.report4110(dateStart, dateEnd) })
  const excel = useMutation({
    mutationFn: () => reportsApi.download4110(dateStart, dateEnd),
    onSuccess: () => notify("Файл отчёта сформирован"),
  })

  const validPeriod = () => {
    if (!dateStart || !dateEnd) return setPeriodError("Укажите период"), false
    if (dateEnd < dateStart) return setPeriodError("Дата окончания раньше даты начала"), false
    setPeriodError(undefined)
    return true
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (validPeriod()) report.mutate()
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Отчёты" subtitle="Форма 41.10 «Анестезиологические пособия» по завершённым операционным случаям" />
      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Input label="Период с" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          <Input label="по" type="date" value={dateEnd} error={periodError} onChange={(e) => setDateEnd(e.target.value)} />
          <Button type="submit" loading={report.isPending}>Сформировать</Button>
          <Button variant="secondary" loading={excel.isPending} onClick={() => validPeriod() && excel.mutate()}>
            Скачать Excel
          </Button>
        </form>
      </Card>
      {(report.error || excel.error) && <ErrorAlert error={report.error ?? excel.error} />}
      {report.data && (
        <Card title={`Протокол 41.10 за период ${formatDate(report.data.date_start)} – ${formatDate(report.data.date_end)}`}
              actions={<span className="text-sm text-slate-500">Операций учтено: {report.data.operations_count}</span>}>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-slate-300 text-sm">
              <thead className="bg-slate-100 text-center">
                <tr>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 text-left">Вид анестезии</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2">№ строки</th>
                  <th colSpan={3} className="border border-slate-300 px-3 py-2">Проведено анестезий, ед</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2">Умерло, чел</th>
                </tr>
                <tr>
                  <th className="border border-slate-300 px-3 py-1">Неотложных</th>
                  <th className="border border-slate-300 px-3 py-1">Экстренных</th>
                  <th className="border border-slate-300 px-3 py-1">Плановых</th>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((row) => (
                  <tr key={row.key} className={row.key === "total" ? "bg-slate-50 font-semibold" : ""}>
                    <td className="border border-slate-300 px-3 py-1.5">{row.name}</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-center">{row.number_line}</td>
                    {[row.anesthesia_urgent, row.anesthesia_emergency, row.anesthesia_planned, row.patient_died].map((value, i) => (
                      <td key={i} className="border border-slate-300 px-3 py-1.5 text-center">{value ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
