import { Role } from "../api/types"

export const ROLE_LABELS: Record<Role, string> = {
  [Role.DOCTOR]: "Врач",
  [Role.NURSE]: "Медсестра/Медбрат",
  [Role.ADMIN]: "Администратор",
  [Role.HEAD]: "Заведующий отделением",
  [Role.ACTING_HEAD]: "ИО заведующего отделением",
}

export const CLINICAL_ROLES = [Role.DOCTOR, Role.NURSE, Role.HEAD, Role.ACTING_HEAD]
export const SUPERVISOR_ROLES = [Role.HEAD, Role.ACTING_HEAD]
export const USER_MANAGER_ROLES = [Role.ADMIN, Role.HEAD, Role.ACTING_HEAD]
export const REPORT_ROLES = [Role.ADMIN, Role.HEAD, Role.ACTING_HEAD]
/** Создание/изменение карточек пациентов и ОС (медсестра — только просмотр). */
export const PATIENT_EDITOR_ROLES = [Role.DOCTOR, Role.HEAD, Role.ACTING_HEAD]
/** Роли, которые могут назначать роли руководителей и администратора. */
export const PRIVILEGED_MANAGER_ROLES = [Role.ADMIN, Role.HEAD]

export const hasRole = (role: Role | undefined, roles: Role[]) => role !== undefined && roles.includes(role)

export function homePathFor(role: Role): string {
  return hasRole(role, CLINICAL_ROLES) ? "/patients" : "/admin/users"
}
