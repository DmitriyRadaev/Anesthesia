import type { Dayjs } from "dayjs"
import { useState } from "react"
import type { ActionValue, AnestheticAction, BreathCharacteristics, BreathType, OperationStage, TimeInterval } from "../../api/types"
import {
  hhmm,
  inCell,
  validateAddAction,
  validateAddBreath,
  validateAddStage,
  validateDeleteAction,
  validateDeleteStage,
  type CardSnapshot,
} from "./cardLogic"
import { AnesInput, CellIcon, ConfirmModal, GridTables, type GridContext } from "./cardUi"
import { ACTION_OPTIONS, actionOption, BREATH_OPTIONS, breathOption, icons, STAGE_OPTIONS, Svg } from "./pictograms"

interface Props {
  grid: GridContext
  card: CardSnapshot
  onActionsChange: (actions: AnestheticAction[]) => void
  onStagesChange: (stages: OperationStage[]) => void
  onBreathChange: (breath: BreathCharacteristics) => void
  warn: (message: string) => void
}

interface Pending {
  title: string
  time: string
  apply: () => void
}

/**
 * Блок «Инфографика»: щелчок по пиктограмме палитры выбирает её, одиночный щелчок по ячейке — предварительный выбор
 * (мерцающая пиктограмма), двойной — установка. Интервал дыхания задаётся двумя двойными щелчками (начало и конец).
 */
export function Infographics({ grid, card, onActionsChange, onStagesChange, onBreathChange, warn }: Props) {
  const { interval } = grid
  const [pickedAction, setPickedAction] = useState<ActionValue | null>(null)
  const [prechoicedAction, setPrechoicedAction] = useState<Dayjs | null>(null)
  const [pickedStage, setPickedStage] = useState<number | null>(null)
  const [prechoicedStage, setPrechoicedStage] = useState<Dayjs | null>(null)
  const [pickedBreath, setPickedBreath] = useState<BreathType | null>(null)
  const [prechoicedBreath, setPrechoicedBreath] = useState<Dayjs | null>(null)
  const [intervalStart, setIntervalStart] = useState<{ type: BreathType; time: Dayjs } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  // --- анестезиологические действия ---------------------------------------------------------------
  const toggleAction = (value: ActionValue) => {
    setPrechoicedAction(null)
    setPickedAction(pickedAction === value ? null : value)
  }
  const addAction = (cell: Dayjs) => {
    if (!pickedAction) return
    const error = validateAddAction(card, pickedAction, cell, interval)
    if (error) return warn(error)
    onActionsChange([...card.actions, { time: cell.format(), value: pickedAction }].sort((a, b) => a.time.localeCompare(b.time)))
  }
  const actionCell = (cell: Dayjs) => {
    const added = card.actions.find((a) => inCell(a.time, cell, interval))
    if (added) {
      const option = actionOption(added.value)
      return option ? <CellIcon svg={option.svg} title={option.description} /> : <span title={added.value_display}>{added.value_display ?? added.value}</span>
    }
    if (pickedAction && prechoicedAction?.isSame(cell)) return <CellIcon svg={actionOption(pickedAction)!.svg} className="prechoiced" />
    return "-"
  }

  // --- этапы операции -----------------------------------------------------------------------------
  const stageOf = (stage: number) => card.stages.find((s) => s.stage === stage)
  const toggleStage = (stage: number) => {
    setPrechoicedStage(null)
    setPickedStage(pickedStage === stage ? null : stage)
  }
  const addStage = (cell: Dayjs) => {
    if (pickedStage === null) return
    const error = validateAddStage(card, pickedStage, cell)
    if (error) return warn(error)
    onStagesChange(card.stages.map((s) => (s.stage === pickedStage ? { ...s, time_start: cell.format() } : s)))
  }
  const stageCell = (cell: Dayjs) => {
    const added = card.stages.find((s) => s.time_start && inCell(s.time_start, cell, interval))
    if (added) return <CellIcon svg={STAGE_OPTIONS[added.stage - 1].svg} title={added.description} />
    if (pickedStage !== null && prechoicedStage?.isSame(cell)) return <CellIcon svg={STAGE_OPTIONS[pickedStage - 1].svg} className="prechoiced" />
    return "-"
  }

  // --- характеристика дыхания ------------------------------------------------------------------------
  const toggleBreath = (type: BreathType) => {
    setPrechoicedBreath(null)
    setIntervalStart(null)
    setPickedBreath(pickedBreath === type ? null : type)
  }
  const breathDoubleClick = (cell: Dayjs) => {
    if (!pickedBreath) return
    if (intervalStart === null) {
      setIntervalStart({ type: pickedBreath, time: cell })
      return
    }
    if (intervalStart.type !== pickedBreath) return warn("Начало и конец интервала должны иметь одинаковую характеристику")
    const error = validateAddBreath(card.breath, pickedBreath, intervalStart.time, cell)
    if (!error) {
      const added: TimeInterval = { time_start: intervalStart.time.format(), time_end: cell.format() }
      onBreathChange({ ...card.breath, [pickedBreath]: [...card.breath[pickedBreath], added].sort((a, b) => a.time_start.localeCompare(b.time_start)) })
    } else {
      warn(error)
    }
    setIntervalStart(null)
    setPrechoicedBreath(null)
  }
  const breathCell = (cell: Dayjs) => {
    for (const option of BREATH_OPTIONS) {
      const covered = card.breath[option.value].some(
        (i) => inCell(i.time_start, cell, interval) || (!cell.isBefore(i.time_start) && i.time_end !== null && !cell.isAfter(i.time_end)),
      )
      if (covered) return <CellIcon svg={option.svg} title={option.description} />
    }
    if (intervalStart?.time.isSame(cell)) return <CellIcon svg={breathOption(intervalStart.type).svg} />
    if (pickedBreath && prechoicedBreath) {
      const inRange = intervalStart !== null && cell.isAfter(intervalStart.time) && cell.isBefore(prechoicedBreath)
      if (inRange || prechoicedBreath.isSame(cell)) return <CellIcon svg={breathOption(pickedBreath).svg} className="prechoiced" />
    }
    return "-"
  }

  /** Ячейка строки: одиночный щелчок — предвыбор, двойной — установка (только при выбранной пиктограмме). */
  const pickCell = (row: string, active: boolean, prechoice: (cell: Dayjs) => void, place: (cell: Dayjs) => void) => (cell: Dayjs) => ({
    className: `pick ${active ? "active" : ""}`,
    onClick: active ? () => prechoice(cell) : undefined,
    onDoubleClick: active ? () => place(cell) : undefined,
    "data-testid": `${row}-${cell.format("HH:mm")}`,
  })

  // --- удаление установленных пиктограмм -------------------------------------------------------------
  const askDeleteAction = (action: AnestheticAction) => {
    const description = actionOption(action.value)?.description ?? action.value
    setPending({
      title: description, time: hhmm(action.time),
      apply: () => {
        const error = validateDeleteAction(card.actions, action)
        if (error) return warn(error)
        onActionsChange(card.actions.filter((a) => a !== action))
        setPrechoicedAction(null)
      },
    })
  }
  const askDeleteStage = (stage: OperationStage) => {
    setPending({
      title: STAGE_OPTIONS[stage.stage - 1].description, time: hhmm(stage.time_start),
      apply: () => {
        const error = validateDeleteStage(card.stages, stage.stage)
        if (error) return warn(error)
        onStagesChange(card.stages.map((s) => (s.stage === stage.stage ? { ...s, time_start: null, description: "" } : s)))
        setPrechoicedStage(null)
      },
    })
  }
  const askDeleteBreath = (type: BreathType, item: TimeInterval) => {
    setPending({
      title: breathOption(type).description, time: `${hhmm(item.time_start)} - ${hhmm(item.time_end)}`,
      apply: () => onBreathChange({ ...card.breath, [type]: card.breath[type].filter((i) => i !== item) }),
    })
  }

  return (
    <div>
      <GridTables
        grid={grid}
        corner="Блок \ Время"
        onUndefinedCell={() => warn(grid.conditionMessage)}
        rows={[
          {
            key: "actions", label: "Анестезиологические действия", active: pickedAction !== null, cell: actionCell, totalBlocked: true,
            cellProps: pickCell("actions", pickedAction !== null, setPrechoicedAction, addAction),
          },
          {
            key: "stages", label: "Этапы операции", active: pickedStage !== null, cell: stageCell, totalBlocked: true,
            cellProps: pickCell("stages", pickedStage !== null, setPrechoicedStage, addStage),
          },
          {
            key: "breath", label: "Характеристика дыхания", active: pickedBreath !== null, cell: breathCell, totalBlocked: true,
            cellProps: pickCell("breath", pickedBreath !== null, setPrechoicedBreath, breathDoubleClick),
          },
        ]}
      />

      <hr className="anes-delimiter" />
      <section>
        <h3 className="pick-title">Выберите анестезиологическое действие</h3>
        <span className="pick-explanation">Выберите пиктограмму анестезиологического действия и установите её в таблице</span>
        <ul className="pick-list">
          {ACTION_OPTIONS.map((option) => {
            const added = card.actions.filter((a) => a.value === option.value)
            return (
              <li key={option.value} className={`pick-item ${added.length ? "framed" : ""}`}>
                <button type="button" title={option.description} aria-label={option.description} aria-pressed={pickedAction === option.value}
                        className={`pick-icon ${pickedAction === option.value ? "active" : ""}`} onClick={() => toggleAction(option.value)}>
                  <Svg src={option.svg} />
                </button>
                {added.length > 0 && (
                  <div className="pick-intervals">
                    {added.map((action) => (
                      <button type="button" key={action.time} className="pick-interval" aria-label={`Удалить ${option.description} ${hhmm(action.time)}`}
                              onClick={() => askDeleteAction(action)}>
                        <span>{hhmm(action.time)}</span>
                        <Svg src={icons.deleteInterval} />
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <hr className="anes-delimiter" />
      <section>
        <h3 className="pick-title">Выберите этапы операции</h3>
        <span className="pick-explanation">Выберите пиктограмму этапа операции и установите её в таблице</span>
        <ul className="pick-list">
          {STAGE_OPTIONS.map((option) => {
            const stage = stageOf(option.stage)
            return (
              <li key={option.stage} className="pick-item framed">
                <button type="button" title={option.description} aria-label={option.description} aria-pressed={pickedStage === option.stage}
                        className={`pick-icon ${pickedStage === option.stage ? "active" : ""}`} onClick={() => toggleStage(option.stage)}>
                  <Svg src={option.svg} />
                </button>
                <AnesInput className="mx-2.5 w-[140px]" placeholder="Введите название" aria-label={`Название: ${option.description}`}
                           maxLength={255} disabled={pickedStage !== option.stage} value={stage?.description ?? ""}
                           onChange={(e) => onStagesChange(card.stages.map((s) => (s.stage === option.stage ? { ...s, description: e.target.value } : s)))} />
                {stage?.time_start && (
                  <button type="button" className="pick-interval mr-2.5" aria-label={`Удалить ${option.description} ${hhmm(stage.time_start)}`}
                          onClick={() => askDeleteStage(stage)}>
                    <span>{hhmm(stage.time_start)}</span>
                    <Svg src={icons.deleteInterval} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <hr className="anes-delimiter" />
      <section>
        <h3 className="pick-title">Выберите характеристику дыхания</h3>
        <span className="pick-explanation">Выберите пиктограмму характеристики дыхания и установите интервал в таблице</span>
        <ul className="pick-list column">
          {BREATH_OPTIONS.map((option) => (
            <li key={option.value} className="pick-item gap-4">
              <button type="button" title={option.description} aria-label={option.description} aria-pressed={pickedBreath === option.value}
                      className={`pick-icon max-h-[30px] ${pickedBreath === option.value ? "active" : ""}`} onClick={() => toggleBreath(option.value)}>
                <Svg src={option.svg} />
              </button>
              <div className="pick-intervals framed">
                {card.breath[option.value].map((item) => (
                  <button type="button" key={item.time_start} className="pick-interval"
                          aria-label={`Удалить ${option.description} ${hhmm(item.time_start)} - ${hhmm(item.time_end)}`}
                          onClick={() => askDeleteBreath(option.value, item)}>
                    <span>{hhmm(item.time_start)} - {hhmm(item.time_end)}</span>
                    <Svg src={icons.deleteInterval} />
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmModal
        open={pending !== null}
        message={pending && `Вы хотите удалить иконку ${pending.title} для указанного времени ${pending.time}?`}
        onYes={() => {
          pending?.apply()
          setPending(null)
        }}
        onNo={() => setPending(null)}
      />
    </div>
  )
}
