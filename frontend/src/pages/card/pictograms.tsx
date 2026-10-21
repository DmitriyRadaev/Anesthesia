import type { ActionValue, BreathType } from "../../api/types"
import addSvg from "../../assets/card/Add.svg?raw"
import closeSvg from "../../assets/card/Close.svg?raw"
import decrementSvg from "../../assets/card/DecrementIntervalButton.svg?raw"
import deleteIntervalSvg from "../../assets/card/DeletePictogramInterval.svg?raw"
import incrementSvg from "../../assets/card/IncrementIntervalButton.svg?raw"
import anesthesiaStartSvg from "../../assets/card/iconAnesthesiaStart.svg?raw"
import anesthesiaStopSvg from "../../assets/card/iconAnesthesiaStop.svg?raw"
import bolusSvg from "../../assets/card/iconBolus.svg?raw"
import infusionStartSvg from "../../assets/card/iconInfusionStart.svg?raw"
import infusionStopSvg from "../../assets/card/iconInfusionStop.svg?raw"
import extubationSvg from "../../assets/card/iconUnifiedExtubation.svg?raw"
import intubationSvg from "../../assets/card/iconUnifiedIntubation.svg?raw"
import stageStartSvg from "../../assets/card/iconUnifiedStartOperation.svg?raw"
import stageStopSvg from "../../assets/card/iconUnifiedStopOperation.svg?raw"
import blockadeSvg from "../../assets/card/letterBlockade.svg?raw"
import decurarisationSvg from "../../assets/card/letterDecurarisation.svg?raw"
import forcedSvg from "../../assets/card/letterForced.svg?raw"
import introductionSvg from "../../assets/card/letterIntroduction.svg?raw"
import premedicationSvg from "../../assets/card/letterPremedication.svg?raw"
import spontaneousSvg from "../../assets/card/letterSpontaneous.svg?raw"
import supportiveSvg from "../../assets/card/letterSupportive.svg?raw"
import turnSvg from "../../assets/card/letterTurn.svg?raw"
import roman2Svg from "../../assets/card/Roman2.svg?raw"
import roman3Svg from "../../assets/card/Roman3.svg?raw"
import roman4Svg from "../../assets/card/Roman4.svg?raw"
import roman5Svg from "../../assets/card/Roman5.svg?raw"

export { Svg } from "../../components/ui/Svg"

export const icons = {
  add: addSvg,
  close: closeSvg,
  decrement: decrementSvg,
  increment: incrementSvg,
  deleteInterval: deleteIntervalSvg,
  infusionStart: infusionStartSvg,
  infusionStop: infusionStopSvg,
  bolus: bolusSvg,
}

export interface ActionOption {
  value: ActionValue
  description: string
  svg: string
}

/** Палитра «Анестезиологические действия» — порядок как в исходной системе. */
export const ACTION_OPTIONS: ActionOption[] = [
  { value: "ANESTHESIA_START", description: "Начало анестезии", svg: anesthesiaStartSvg },
  { value: "INTUBATION", description: "Интубация трахеи", svg: intubationSvg },
  { value: "ANESTHESIA_STOP", description: "Окончание анестезии", svg: anesthesiaStopSvg },
  { value: "EXTUBATION", description: "Экстубация трахеи", svg: extubationSvg },
  { value: "PREMEDICATION", description: "Премедикация", svg: premedicationSvg },
  { value: "INTRODUCTION", description: "Вводный наркоз", svg: introductionSvg },
  { value: "TURN", description: "Поворот", svg: turnSvg },
  { value: "DECURARISATION", description: "Декураризация", svg: decurarisationSvg },
  { value: "BLOCKADE", description: "Блокада", svg: blockadeSvg },
]

export const actionOption = (value: ActionValue): ActionOption | undefined => ACTION_OPTIONS.find((o) => o.value === value)

/** Пиктограммы этапов операции I–VI (индекс = номер этапа − 1). */
export const STAGE_OPTIONS: Array<{ stage: number; description: string; svg: string }> = [
  { stage: 1, description: "Первый этап", svg: stageStartSvg },
  { stage: 2, description: "Второй этап", svg: roman2Svg },
  { stage: 3, description: "Третий этап", svg: roman3Svg },
  { stage: 4, description: "Четвертый этап", svg: roman4Svg },
  { stage: 5, description: "Пятый этап", svg: roman5Svg },
  { stage: 6, description: "Шестой этап", svg: stageStopSvg },
]

export const BREATH_OPTIONS: Array<{ value: BreathType; description: string; svg: string }> = [
  { value: "spontaneous", description: "Спонтанное", svg: spontaneousSvg },
  { value: "supportive", description: "Вспомогательное", svg: supportiveSvg },
  { value: "forced", description: "Принудительное", svg: forcedSvg },
]

export const breathOption = (value: BreathType) => BREATH_OPTIONS.find((o) => o.value === value)!
