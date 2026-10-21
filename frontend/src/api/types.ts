/** Типы данных REST API (соответствуют сериализаторам DRF, см. /api/docs/). */

export type ISODate = string // YYYY-MM-DD
export type ISODateTime = string // ISO 8601 с часовым поясом
export type ID = number

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// --- пользователи -------------------------------------------------------------------------

export enum Role {
  DOCTOR = 1,
  NURSE = 2,
  ADMIN = 3,
  HEAD = 4,
  ACTING_HEAD = 5,
}

export interface User {
  id: ID
  username: string
  surname: string
  firstname: string
  lastname: string
  full_name: string
  birthdate: ISODate | null
  role: Role
  role_display: string
  is_active: boolean
  employee_code: string
  speciality: string
  department: string
  job_title: string
  last_login: ISODateTime | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export type UserCreate = Pick<User, "username" | "surname" | "firstname" | "lastname" | "role"> &
  Partial<Pick<User, "birthdate" | "is_active" | "employee_code" | "speciality" | "department" | "job_title">> & {
    password: string
  }

export type UserUpdate = Partial<Omit<UserCreate, "password">>

export interface LoginResponse {
  token: string
  expires_at: ISODateTime | null
  user: User
}

export interface StaffMember {
  id: ID
  full_name: string
}

export interface MedicalStaff {
  doctors: StaffMember[]
  nurses: StaffMember[]
}

// --- справочники ---------------------------------------------------------------------------

export interface CatalogItem {
  id: ID
  name: string
  code?: string
  description?: string
  type?: string | number
  value?: string
  head?: ID
  department_type?: ID
}

// --- пациенты и операционные случаи ---------------------------------------------------------

export enum PatientStatus {
  NEW = 1,
  ACTIVE = 2,
  ARCHIVE = 3,
}

export enum OperationStatus {
  ARRIVED = 1,
  ON_OPERATION = 2,
  FINISHED = 3,
  CANCELLED = 4,
}

export interface OperationBrief {
  id: ID
  status: OperationStatus
  status_display: string
  operation_date: ISODate | null
  operation_time: string | null
  type_operation: ID
  type_operation_name: string
  operation_name: string
  diagnosis_name: string
  pid: string
  reason_cancel: string
  doctor: ID | null
  doctor_name: string | null
  nurse: ID | null
  nurse_name: string | null
}

export interface Patient {
  id: ID
  status: PatientStatus
  status_display: string
  surname: string
  firstname: string
  lastname: string
  full_name: string
  sex: ID
  sex_name: string
  birthdate: ISODate
  blood_group: ID
  blood_group_name: string
  blood_rh: ID
  blood_rh_name: string
  snils: string
  enp: string
  height: number | null
  weight: number | null
  operations: OperationBrief[]
  created_at: ISODateTime
  updated_at: ISODateTime
}

export type PatientInput = Pick<
  Patient,
  "surname" | "firstname" | "lastname" | "sex" | "birthdate" | "blood_group" | "blood_rh" | "snils" | "enp"
>

export interface Operation {
  id: ID
  patient: ID
  patient_info: {
    id: ID
    surname: string
    firstname: string
    lastname: string
    full_name: string
    sex: ID
    birthdate: ISODate
    blood_group: ID
    blood_rh: ID
    status: PatientStatus
  }
  status: OperationStatus
  status_display: string
  operation_date: ISODate | null
  operation_time: string | null
  pid: string
  type_operation: ID
  type_operation_name: string
  operation_name: string
  operation_code: string
  federal_code: string
  diagnosis: ID | null
  diagnosis_name: string
  history_number: string
  asa: ID | null
  volume_operation: ID | null
  department: ID | null
  ventilator: ID | null
  monitoring: ID | null
  complaints_patient: string
  features_anamnesis: string
  drug_intolerance: string
  height: string | null
  weight: string | null
  bmi: number | null
  reason_cancel: string
  doctor: ID | null
  doctor_name: string | null
  nurse: ID | null
  nurse_name: string | null
  is_anesthesia_started: boolean
  is_anesthesia_stopped: boolean
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface OperationInput {
  patient?: ID
  operation_date: ISODate
  operation_time?: string | null
  pid?: string
  type_operation: ID
  operation_name: string
  diagnosis_name?: string
  history_number?: string
  doctor?: ID | null
  nurse?: ID | null
  height?: string | number | null
  weight?: string | number | null
}

// --- наркозная карта -----------------------------------------------------------------------

export type ActionValue =
  | "ANESTHESIA_START"
  | "ANESTHESIA_STOP"
  | "INTUBATION"
  | "EXTUBATION"
  | "PREMEDICATION"
  | "INTRODUCTION"
  | "TURN"
  | "DECURARISATION"
  | "BLOCKADE"
  | "OPERATION_START"
  | "OPERATION_STOP"
  | "INFUSION_START"
  | "INFUSION_STOP"
  | "SPONTANEOUS"
  | "SUPPORTIVE"
  | "FORCED"

export interface AnestheticAction {
  id?: ID
  time: ISODateTime
  value: ActionValue
  value_display?: string
}

export type BreathType = "spontaneous" | "supportive" | "forced"
export interface TimeInterval {
  time_start: ISODateTime
  time_end: ISODateTime | null
}
export type BreathCharacteristics = Record<BreathType, TimeInterval[]>

export interface OperationStage {
  stage: number
  time_start: ISODateTime | null
  description: string
}

export type DrugSection = "premedication" | "introduction" | "maintenance"
export type InjectionType = "BOLUS" | "INFUSION"

export interface DrugItem extends TimeInterval {
  injection_type: InjectionType
  measurement_unit: ID
  dose: string
}
export interface DrugGroup {
  drug: string
  items: DrugItem[]
}

export interface InfusionGroup {
  solution: string
  items: Array<TimeInterval & { dose: string }>
}
export interface TransfusionGroup {
  solution: string
  items: Array<TimeInterval & { gemakon: string }>
}
export interface LiquidGroup {
  liquid: string
  items: Array<TimeInterval & { volume: string }>
}

export interface DoseTotal {
  drug: string
  dose: number
  unit: string
  text: string
}

export interface CardPatientInfo {
  id: ID
  surname: string
  firstname: string
  lastname: string
  birthdate: ISODate
  sex: ID
  blood_group: ID
  blood_rh: ID
  status: OperationStatus
  operation_date: ISODate | null
  operation_time: string | null
  pid: string
  operation_code: string
  asa: ID | null
  volume_operation: ID | null
  department: ID | null
  drug_intolerance: string
  type_operation: ID
  ventilator: ID | null
  monitoring: ID | null
  operation_name: string
  diagnosis_name: string
  height: string | null
  weight: string | null
  bmi: number | null
}

export interface Pressure {
  SYS: string | null
  MEAN: string | null
  DIA: string | null
}
export interface CMSPoint {
  TEMP: string | null
  BIS: string | null
  O2: string | null
  AIR: string | null
  SpO2: string | null
  CO2: string | null
  N2O: string | null
  RESP_RATE: string | null
  HEART_RATE: string | null
  PULS: string | null
  SEVOFL: string | null
  DESFL: string | null
  ISOFL: string | null
  PRESS_BLD_VEN_CENT: Pressure | null
  PRESS_BLD: Pressure | null
  PRESS_BLD_ART: Pressure | null
  PRESS_BLD_ART_ABP: Pressure | null
  PRESS_BLD_NONINV: Pressure | null
  PRESS_BLD_ART_FEMORAL: Pressure | null
  PRESS_BLD_ART_BRACHIAL: Pressure | null
}
export interface CMSResponse {
  time_start: ISODateTime | null
  time_end: ISODateTime | null
  pid: string
  data: Record<ISODateTime, CMSPoint>
}

// --- мониторинг ----------------------------------------------------------------------------

export interface Observation {
  observation_number: string
  observation_name: string
  observation_value: string
  unit: string
}
export interface HL7Result {
  observation_at: ISODateTime
  pid: string
  department: string
  room: string
  bed: string
  device: string
  observations: Observation[]
}
export interface OperationResults {
  pid: string
  count: number
  results: HL7Result[]
}

// --- лабораторный мониторинг ---------------------------------------------------------------

export interface LabField {
  code: string
  label: string
  unit: string
  type: "number" | "signed" | "plus" | "text"
}
export interface LabSection {
  key: string
  title: string
  fields: LabField[]
}
export interface LabResult {
  values: Record<string, Record<string, string | number>>
  updated_at: ISODateTime | null
  updated_by_name: string | null
}

// --- отчёты ---------------------------------------------------------------------------------

export interface ReportRow {
  key: string
  name: string
  number_line: number
  anesthesia_urgent: number | null
  anesthesia_emergency: number | null
  anesthesia_planned: number | null
  patient_died: number | null
}
export interface Report4110 {
  date_start: ISODate
  date_end: ISODate
  rows: ReportRow[]
  operations_count: number
}
