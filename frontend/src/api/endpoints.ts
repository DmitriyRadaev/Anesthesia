import { download, request } from "./client"
import type {
  AnestheticAction,
  BreathCharacteristics,
  CardPatientInfo,
  CatalogItem,
  CMSResponse,
  DoseTotal,
  DrugGroup,
  DrugSection,
  ID,
  InfusionGroup,
  LabResult,
  LabSection,
  LiquidGroup,
  LoginResponse,
  MedicalStaff,
  Operation,
  OperationInput,
  OperationResults,
  OperationStage,
  Paginated,
  Patient,
  PatientInput,
  Report4110,
  TransfusionGroup,
  User,
  UserCreate,
  UserUpdate,
} from "./types"

type Json = Record<string, unknown>

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>("/api/auth/login/", { method: "POST", body: { username, password } }),
  logout: () => request<void>("/api/auth/logout/", { method: "POST" }),
  me: () => request<User>("/api/auth/me/"),
  changePassword: (old_password: string, password: string) =>
    request<void>("/api/auth/change-password/", { method: "POST", body: { old_password, password } }),
}

export interface UserListParams {
  search?: string
  role?: number | ""
  is_active?: "true" | "false" | ""
  ordering?: string
  page?: number
}

export const usersApi = {
  list: (params: UserListParams) => request<Paginated<User>>("/api/users/", { query: { ...params } }),
  create: (data: UserCreate) => request<User>("/api/users/", { method: "POST", body: data }),
  update: (id: ID, data: UserUpdate) => request<User>(`/api/users/${id}/`, { method: "PATCH", body: data }),
  setPassword: (id: ID, password: string) =>
    request<void>(`/api/users/${id}/set-password/`, { method: "POST", body: { password } }),
  roles: () => request<Array<{ id: number; name: string }>>("/api/users/roles/"),
  medicalStaff: () => request<MedicalStaff>("/api/users/medical-staff/"),
}

export const catalogsApi = {
  get: (slug: string, query?: Record<string, string | number>) =>
    request<CatalogItem[]>(`/api/catalogs/${slug}/`, { query }),
}

export interface PatientListParams {
  status?: number | ""
  search_surname?: string
  mine?: boolean
  page?: number
}

export const patientsApi = {
  list: (params: PatientListParams) =>
    request<Paginated<Patient>>("/api/patients/", { query: { ...params, mine: params.mine ? "true" : undefined } }),
  get: (id: ID) => request<Patient>(`/api/patients/${id}/`),
  create: (data: PatientInput) => request<Patient>("/api/patients/", { method: "POST", body: data }),
  update: (id: ID, data: Partial<PatientInput>) => request<Patient>(`/api/patients/${id}/`, { method: "PATCH", body: data }),
  remove: (id: ID) => request<void>(`/api/patients/${id}/`, { method: "DELETE" }),
  archive: (id: ID) => request<Patient>(`/api/patients/${id}/archive/`, { method: "POST" }),
  unarchive: (id: ID) => request<Patient>(`/api/patients/${id}/unarchive/`, { method: "POST" }),
}

export const operationsApi = {
  get: (id: ID) => request<Operation>(`/api/operations/${id}/`),
  create: (data: OperationInput) => request<Operation>("/api/operations/", { method: "POST", body: data }),
  update: (id: ID, data: Partial<OperationInput>) =>
    request<Operation>(`/api/operations/${id}/`, { method: "PATCH", body: data }),
  cancel: (id: ID, reason_cancel: string) =>
    request<Operation>(`/api/operations/${id}/cancel/`, { method: "POST", body: { reason_cancel } }),
  finish: (id: ID) => request<Operation>(`/api/operations/${id}/finish/`, { method: "POST" }),
}

const card = (id: ID, block: string) => `/api/operations/${id}/card/${block}/`

export const cardApi = {
  patientInfo: (id: ID) => request<CardPatientInfo>(card(id, "patient-info")),
  updatePatientInfo: (id: ID, data: Partial<CardPatientInfo>) =>
    request<CardPatientInfo>(card(id, "patient-info"), { method: "PATCH", body: data }),
  updatePidDateTime: (id: ID, data: { pid: string; operation_date: string | null; operation_time: string | null }) =>
    request<typeof data>(card(id, "pid-datetime"), { method: "PATCH", body: data }),
  actions: (id: ID) => request<AnestheticAction[]>(card(id, "actions")),
  saveActions: (id: ID, data: AnestheticAction[]) =>
    request<AnestheticAction[]>(card(id, "actions"), { method: "PUT", body: data }),
  breath: (id: ID) => request<BreathCharacteristics>(card(id, "breath")),
  saveBreath: (id: ID, data: BreathCharacteristics) =>
    request<BreathCharacteristics>(card(id, "breath"), { method: "PUT", body: data }),
  stages: (id: ID) => request<OperationStage[]>(card(id, "stages")),
  saveStages: (id: ID, data: OperationStage[]) => request<OperationStage[]>(card(id, "stages"), { method: "PUT", body: data }),
  drugs: (id: ID, section: DrugSection) => request<DrugGroup[]>(card(id, `drugs/${section}`)),
  saveDrugs: (id: ID, section: DrugSection, data: DrugGroup[]) =>
    request<DrugGroup[]>(card(id, `drugs/${section}`), { method: "PUT", body: data }),
  drugTotals: (id: ID) => request<DoseTotal[]>(card(id, "drugs/totals")),
  infusions: (id: ID) => request<InfusionGroup[]>(card(id, "infusions")),
  saveInfusions: (id: ID, data: InfusionGroup[]) =>
    request<InfusionGroup[]>(card(id, "infusions"), { method: "PUT", body: data }),
  transfusions: (id: ID) => request<TransfusionGroup[]>(card(id, "transfusions")),
  saveTransfusions: (id: ID, data: TransfusionGroup[]) =>
    request<TransfusionGroup[]>(card(id, "transfusions"), { method: "PUT", body: data }),
  liquids: (id: ID) => request<LiquidGroup[]>(card(id, "liquids")),
  saveLiquids: (id: ID, data: LiquidGroup[]) => request<LiquidGroup[]>(card(id, "liquids"), { method: "PUT", body: data }),
  cms: (id: ID) => request<CMSResponse>(card(id, "cms")),
  print: (id: ID) => request<Json>(card(id, "print")),
}

export const protocolApi = {
  get: <T = Json>(id: ID, block: string) => request<T>(`/api/operations/${id}/protocol/${block}/`),
  put: <T = Json>(id: ID, block: string, data: unknown) =>
    request<T>(`/api/operations/${id}/protocol/${block}/`, { method: "PUT", body: data }),
  patch: <T = Json>(id: ID, block: string, data: unknown) =>
    request<T>(`/api/operations/${id}/protocol/${block}/`, { method: "PATCH", body: data }),
}

export const monitoringApi = {
  results: (id: ID, date_start?: string) =>
    request<OperationResults>(`/api/operations/${id}/monitoring/results/`, { query: { date_start } }),
}

export const labsApi = {
  schema: (id: ID) => request<LabSection[]>(`/api/operations/${id}/labs/schema/`),
  get: (id: ID) => request<LabResult>(`/api/operations/${id}/labs/`),
  save: (id: ID, values: LabResult["values"]) =>
    request<LabResult>(`/api/operations/${id}/labs/`, { method: "PUT", body: { values } }),
}

export const medicamentsApi = {
  search: (search_name: string) =>
    request<Paginated<{ id: ID; name: string; group: ID; group_name: string }>>("/api/medicaments/", {
      query: { search_name },
    }),
}

export const reportsApi = {
  report4110: (date_start: string, date_end: string) =>
    request<Report4110>("/api/reports/4110/data/", { query: { date_start, date_end } }),
  download4110: (date_start: string, date_end: string) => download("/api/reports/4110/", { date_start, date_end }),
}
