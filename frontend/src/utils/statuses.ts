import { OperationStatus, PatientStatus } from "../api/types"
import type { BadgeColor } from "../components/ui/Misc"

export const PATIENT_STATUS: Record<PatientStatus, { label: string; color: BadgeColor }> = {
  [PatientStatus.NEW]: { label: "Новая", color: "blue" },
  [PatientStatus.ACTIVE]: { label: "Активная", color: "green" },
  [PatientStatus.ARCHIVE]: { label: "Архивная", color: "gray" },
}

export const OPERATION_STATUS: Record<OperationStatus, { label: string; color: BadgeColor }> = {
  [OperationStatus.ARRIVED]: { label: "Поступил", color: "blue" },
  [OperationStatus.ON_OPERATION]: { label: "На операции", color: "amber" },
  [OperationStatus.FINISHED]: { label: "Завершён", color: "green" },
  [OperationStatus.CANCELLED]: { label: "Отменён", color: "red" },
}

export const isActiveOperation = (status: OperationStatus) =>
  status === OperationStatus.ARRIVED || status === OperationStatus.ON_OPERATION
