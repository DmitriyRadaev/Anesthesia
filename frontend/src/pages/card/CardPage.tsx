import { useMutation, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { cardApi } from "../../api/endpoints"
import type {
  AnestheticAction,
  BreathCharacteristics,
  DrugGroup,
  DrugSection,
  InfusionGroup,
  LiquidGroup,
  OperationStage,
  TransfusionGroup,
} from "../../api/types"
import { useAuth } from "../../auth/AuthContext"
import { hasRole, SUPERVISOR_ROLES } from "../../auth/roles"
import { OperationHeader } from "../../components/OperationHeader"
import { useUnsavedChanges } from "../../components/UnsavedChanges"
import { ErrorAlert, errorMessage } from "../../components/ui/Feedback"
import { Modal } from "../../components/ui/Modal"
import { Spinner } from "../../components/ui/Spinner"
import { useToast } from "../../components/ui/Toast"
import { useCatalog } from "../../hooks/useCatalog"
import "./card.css"
import { emptyStages, generateCells, generationCondition, hhmm, type CardSnapshot } from "./cardLogic"
import { Accordion, AnesButton, ConfirmModal, type GridContext } from "./cardUi"
import { GroupTable } from "./GroupTable"
import { Infographics } from "./Infographics"
import { CMSTable, GasesTable } from "./MonitorTables"
import { PatientInfoBlock, toInfoForm, validateInfo, type InfoForm } from "./PatientInfoBlock"
import { drugConfig, infusionConfig, liquidConfig, transfusionConfig } from "./tableConfigs"
import { cardKey, useCardQueries } from "./useCard"

const DRUG_ACCORDIONS: Array<[DrugSection, string]> = [
  ["premedication", "Премедикация"],
  ["introduction", "Введение в анестезию"],
  ["maintenance", "Поддержание анестезии"],
]

const END_TIME_INFO =
  "Для установки времени завершения анестезии в блоке \"Анестезиологические действия\" необходимо выбрать соответствующую пиктограмму: \"Завершение анестезии\""
const ARRIVAL_INFO =
  "Внимание! Редактирование поля \"Время поступления\" доступно до установки пиктограмм в блоках страницы \"Наркозная карта\""
const CLEAR_TEXT =
  "Вся информация по показателям пациента и вводимым ему препаратам будет удалена. Для повторного заполнения информации воспользуйтесь ручным вводом"

const EMPTY_BREATH: BreathCharacteristics = { spontaneous: [], supportive: [], forced: [] }

/** Текущее время с обновлением раз в 30 секунд — ячейки карты растут до окончания анестезии. */
function useNow(active: boolean) {
  const [now, setNow] = useState(dayjs())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(dayjs()), 30_000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

export function CardPage() {
  const operationId = Number(useParams().operationId)
  const data = useCardQueries(operationId)
  const queryClient = useQueryClient()
  const notify = useToast()
  const { user } = useAuth()
  const units = useCatalog("measurement_units")

  // --- локальные данные карты (сохраняются кнопкой «Сохранить», как в исходной системе) -----------------
  const [form, setForm] = useState<InfoForm | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof InfoForm, string>>>({})
  const [actions, setActions] = useState<AnestheticAction[]>([])
  const [breath, setBreath] = useState<BreathCharacteristics>(EMPTY_BREATH)
  const [stages, setStages] = useState<OperationStage[]>(emptyStages())
  const [dirty, setDirty] = useState(false)
  const [interval, setInterval] = useState(5)
  const [modal, setModal] = useState<"invalid" | "clear" | "endInfo" | null>(null)
  const initialized = useRef(false)

  const loaded = data.info.data && data.actions.data && data.breath.data && data.stages.data
  useEffect(() => {
    if (!loaded || initialized.current) return
    initialized.current = true
    setForm(toInfoForm(data.info.data!))
    setActions(data.actions.data!)
    setBreath(data.breath.data!)
    setStages(data.stages.data!.length ? data.stages.data! : emptyStages())
  }, [loaded, data.info.data, data.actions.data, data.breath.data, data.stages.data])

  useUnsavedChanges(dirty)

  const groups = {
    premedication: data.premedication.data ?? [],
    introduction: data.introduction.data ?? [],
    maintenance: data.maintenance.data ?? [],
    infusions: data.infusions.data ?? [],
    transfusions: data.transfusions.data ?? [],
    liquids: data.liquids.data ?? [],
  }

  // --- ячейки времени -----------------------------------------------------------------------------------
  const condition = generationCondition(form?.operation_date ?? "", form?.operation_time ?? "")
  const arrival = condition.ok ? dayjs(`${form!.operation_date}T${form!.operation_time}`) : null
  const stopAction = actions.find((a) => a.value === "ANESTHESIA_STOP")
  const now = useNow(arrival !== null && !stopAction)
  const cells = useMemo(
    () => (arrival ? generateCells(arrival, interval, stopAction ? dayjs(stopAction.time) : null, now) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arrival?.valueOf(), interval, stopAction?.time, now],
  )
  const grid: GridContext = { cells, interval, setInterval, conditionMessage: condition.message }

  const iconsPresent =
    actions.length > 0 || Object.values(breath).some((items) => items.length > 0) || Object.values(groups).some((g) => g.length > 0)

  // --- сохранение блоков таблиц препаратов (сразу, как в исходной системе) ------------------------------------
  const saveBlock = <T,>(block: string, request: (rows: T[]) => Promise<T[]>) => async (rows: T[]) => {
    const saved = await request(rows)
    queryClient.setQueryData(cardKey(operationId, block), saved)
    queryClient.invalidateQueries({ queryKey: cardKey(operationId, "totals") })
    return saved
  }
  const groupSave = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown> }) => run(),
    onSuccess: () => notify("Сохранено"),
    onError: (error) => notify(errorMessage(error), "error"),
  })
  const saveGroups = <T,>(block: string, request: (rows: T[]) => Promise<T[]>) => (rows: T[]) =>
    groupSave.mutateAsync({ run: () => saveBlock(block, request)(rows) })

  // --- дата, время поступления и PID: автосохранение через 1 с после изменения ---------------------------------
  const pidTimer = useRef<number>()
  const savePidDateTime = (next: InfoForm) => {
    window.clearTimeout(pidTimer.current)
    pidTimer.current = window.setTimeout(async () => {
      if (!generationCondition(next.operation_date, next.operation_time).ok) return
      try {
        await cardApi.updatePidDateTime(operationId, { pid: next.pid, operation_date: next.operation_date, operation_time: next.operation_time })
        queryClient.invalidateQueries({ queryKey: cardKey(operationId, "cms") })
        queryClient.invalidateQueries({ queryKey: ["operation", String(operationId)] })
      } catch (error) {
        notify(errorMessage(error), "warning")
      }
    }, 1000)
  }
  useEffect(() => () => window.clearTimeout(pidTimer.current), [])

  const changeField = (key: keyof InfoForm, value: string) => {
    if (!form) return
    const next = { ...form, [key]: value }
    setForm(next)
    setDirty(true)
    if (key === "operation_date" || key === "operation_time" || key === "pid") savePidDateTime(next)
  }

  // --- «Сохранить»: сведения, дата/время/PID, действия, дыхание, этапы ---------------------------------------
  const save = useMutation({
    mutationFn: async (values: InfoForm) => {
      const id = (v: string) => (v ? Number(v) : null)
      const info = await cardApi.updatePatientInfo(operationId, {
        type_operation: Number(values.type_operation), asa: id(values.asa), volume_operation: id(values.volume_operation),
        department: id(values.department), ventilator: id(values.ventilator), monitoring: id(values.monitoring),
        operation_name: values.operation_name, diagnosis_name: values.diagnosis_name, drug_intolerance: values.drug_intolerance,
        height: values.height ? values.height.replace(",", ".") : null, weight: values.weight ? values.weight.replace(",", ".") : null,
      })
      await cardApi.updatePidDateTime(operationId, {
        pid: values.pid, operation_date: values.operation_date || null, operation_time: values.operation_time || null,
      })
      const savedActions = await cardApi.saveActions(operationId, actions.map(({ time, value }) => ({ time, value })))
      const savedBreath = await cardApi.saveBreath(operationId, breath)
      const savedStages = await cardApi.saveStages(operationId, stages)
      return { info, savedActions, savedBreath, savedStages }
    },
    onSuccess: ({ info, savedActions, savedBreath, savedStages }) => {
      queryClient.setQueryData(cardKey(operationId, "patient-info"), info)
      queryClient.setQueryData(cardKey(operationId, "actions"), savedActions)
      queryClient.setQueryData(cardKey(operationId, "breath"), savedBreath)
      queryClient.setQueryData(cardKey(operationId, "stages"), savedStages)
      queryClient.invalidateQueries({ queryKey: ["operation", String(operationId)] })
      queryClient.invalidateQueries({ queryKey: cardKey(operationId, "cms") })
      setActions(savedActions)
      setDirty(false)
      notify("Наркозная карта сохранена")
    },
  })
  const submit = () => {
    if (!form) return
    const nextErrors = validateInfo(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return setModal("invalid")
    save.mutate(form)
  }

  // --- «Очистить все» (заведующий и ИО заведующего) ---------------------------------------------------------
  const clear = useMutation({
    mutationFn: () =>
      Promise.all([
        saveBlock("liquids", (r: LiquidGroup[]) => cardApi.saveLiquids(operationId, r))([]),
        saveBlock("infusions", (r: InfusionGroup[]) => cardApi.saveInfusions(operationId, r))([]),
        saveBlock("transfusions", (r: TransfusionGroup[]) => cardApi.saveTransfusions(operationId, r))([]),
        ...DRUG_ACCORDIONS.map(([section]) => saveBlock(`drugs/${section}`, (r: DrugGroup[]) => cardApi.saveDrugs(operationId, section, r))([])),
      ]),
    onSuccess: () => {
      setActions([])
      setBreath(EMPTY_BREATH)
      setStages(emptyStages())
      setForm((f) => (f ? { ...f, operation_date: "", operation_time: "" } : f))
      setDirty(true)
      setModal(null)
      notify("Данные карты очищены. Нажмите «Сохранить», чтобы зафиксировать изменения.", "info")
    },
    onError: (error) => notify(errorMessage(error), "error"),
  })

  if (!form || !loaded) {
    const error = data.info.error ?? data.actions.error ?? data.breath.error ?? data.stages.error
    return (
      <div className="max-w-[1100px]">
        <OperationHeader operationId={operationId} />
        {error ? <ErrorAlert error={error} onRetry={() => data.info.refetch()} /> : <div className="flex justify-center py-20"><Spinner /></div>}
      </div>
    )
  }

  const card: CardSnapshot | null = arrival && {
    arrival, actions, breath, stages,
    drugs: { premedication: groups.premedication, introduction: groups.introduction, maintenance: groups.maintenance },
    infusions: groups.infusions, transfusions: groups.transfusions, liquids: groups.liquids,
  }
  const warn = (message: string) => notify(message, "warning")
  const unitList = units.data ?? []

  return (
    <div className="max-w-[1100px]">
      <OperationHeader operationId={operationId} />
      <div className="anes-card rounded-2xl p-5 shadow-[0_0_50px_rgba(133,162,236,0.3)]" style={{ background: "linear-gradient(92.04deg,#F9FCFF 17.38%,#F5F6FF 91.35%)" }}>
        <div className="mb-[15px] flex items-center justify-between">
          <h1 className="text-2xl font-medium text-[#5068a5]">Наркозная карта</h1>
          <Link to={`/operations/${operationId}/card/print`} className="text-sm font-medium text-[#5068a5] underline-offset-2 hover:underline">
            Печатная форма
          </Link>
        </div>

        <PatientInfoBlock
          info={data.info.data!}
          form={form}
          errors={errors}
          onChange={changeField}
          arrivalLocked={iconsPresent}
          anesthesiaEnd={hhmm(stopAction?.time)}
          onArrivalInfo={() => notify(ARRIVAL_INFO, "info")}
          onEndInfo={() => setModal("endInfo")}
        />

        <Accordion title="Инфографика">
          {card ? (
            <Infographics grid={grid} card={card} warn={warn}
                          onActionsChange={(next) => { setActions(next); setDirty(true) }}
                          onStagesChange={(next) => { setStages(next); setDirty(true) }}
                          onBreathChange={(next) => { setBreath(next); setDirty(true) }} />
          ) : (
            <p className="py-4 text-sm text-[#91a0c6]" role="status">{condition.message}</p>
          )}
        </Accordion>
        {DRUG_ACCORDIONS.map(([section, title]) => (
          <Accordion key={section} title={title}>
            <GroupTable config={drugConfig(section, unitList)} grid={grid} arrival={arrival} groups={groups[section]} saving={groupSave.isPending}
                        onSave={saveGroups(`drugs/${section}`, (rows: DrugGroup[]) => cardApi.saveDrugs(operationId, section, rows))} />
          </Accordion>
        ))}
        <Accordion title="Инфузионная терапия">
          <GroupTable config={infusionConfig} grid={grid} arrival={arrival} groups={groups.infusions} saving={groupSave.isPending}
                      onSave={saveGroups("infusions", (rows: InfusionGroup[]) => cardApi.saveInfusions(operationId, rows))} />
        </Accordion>
        <Accordion title="Трансфузионная терапия">
          <GroupTable config={transfusionConfig} grid={grid} arrival={arrival} groups={groups.transfusions} saving={groupSave.isPending}
                      onSave={saveGroups("transfusions", (rows: TransfusionGroup[]) => cardApi.saveTransfusions(operationId, rows))} />
        </Accordion>
        <Accordion title="Жидкостные потери">
          <GroupTable config={liquidConfig} grid={grid} arrival={arrival} groups={groups.liquids} saving={groupSave.isPending} testId="addLiquidsModal"
                      onSave={saveGroups("liquids", (rows: LiquidGroup[]) => cardApi.saveLiquids(operationId, rows))} />
        </Accordion>
        <Accordion title="Медицинские газы">
          <GasesTable grid={grid} cms={data.cms.data} />
        </Accordion>
        <Accordion title="ЦМС">
          <CMSTable grid={grid} cms={data.cms.data} />
        </Accordion>

        {save.error !== null && <div className="mt-4"><ErrorAlert error={save.error} /></div>}
        <div className="mt-2.5 flex items-center justify-end gap-5">
          {dirty && <span className="text-xs text-amber-700">Есть несохранённые изменения</span>}
          {hasRole(user?.role, SUPERVISOR_ROLES) && <AnesButton onClick={() => setModal("clear")}>Очистить все</AnesButton>}
          <AnesButton disabled={save.isPending} onClick={submit}
                      icon={<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z" /></svg>}>
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </AnesButton>
        </div>
      </div>

      <ConfirmModal open={modal === "clear"} message={CLEAR_TEXT} yes="Ок" no="Отмена" onYes={() => clear.mutate()} onNo={() => setModal(null)} />
      <Modal open={modal === "invalid"} title="Внимание" onClose={() => setModal(null)} footer={<AnesButton onClick={() => setModal(null)}>Ок</AnesButton>}>
        <p className="text-sm text-[#5068a5]">Проверьте правильность заполнения полей</p>
      </Modal>
      <Modal open={modal === "endInfo"} title="Сообщение" onClose={() => setModal(null)} footer={<AnesButton onClick={() => setModal(null)}>Ок</AnesButton>}>
        <p className="text-sm text-[#5068a5]">{END_TIME_INFO}</p>
      </Modal>
    </div>
  )
}
