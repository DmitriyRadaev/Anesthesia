import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { ApiError } from "../../api/client"
import { usersApi } from "../../api/endpoints"
import { Role, type User, type UserCreate } from "../../api/types"
import { useCurrentUser } from "../../auth/AuthContext"
import { hasRole, PRIVILEGED_MANAGER_ROLES, ROLE_LABELS } from "../../auth/roles"
import { Button } from "../../components/ui/Button"
import { EmptyState, ErrorAlert, errorMessage, QueryState } from "../../components/ui/Feedback"
import { Input, Select } from "../../components/ui/Form"
import { Badge, PageHeader, Pagination } from "../../components/ui/Misc"
import { ConfirmDialog, Modal } from "../../components/ui/Modal"
import { useToast } from "../../components/ui/Toast"
import { formatDateTime } from "../../utils/format"
import { hasErrors, mergeServerErrors, personName, required, type Errors } from "../../utils/validation"

const PRIVILEGED_TARGETS = [Role.ADMIN, Role.HEAD, Role.ACTING_HEAD]
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

type SortKey = "surname" | "username" | "role" | "last_login"

export function UsersPage() {
  const currentUser = useCurrentUser()
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [role, setRole] = useState("")
  const [active, setActive] = useState<"" | "true" | "false">("")
  const [ordering, setOrdering] = useState<string>("surname")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)
  const [passwordFor, setPasswordFor] = useState<User | null>(null)
  const [toggleFor, setToggleFor] = useState<User | null>(null)
  const queryClient = useQueryClient()
  const notify = useToast()

  const users = useQuery({
    queryKey: ["users", { appliedSearch, role, active, ordering, page }],
    queryFn: () => usersApi.list({ search: appliedSearch, role: role ? Number(role) : "", is_active: active, ordering, page }),
    placeholderData: (previous) => previous,
  })

  const toggle = useMutation({
    mutationFn: (user: User) => usersApi.update(user.id, { is_active: !user.is_active }),
    onSuccess: (user) => {
      notify(user.is_active ? "Учётная запись активирована" : "Учётная запись деактивирована")
      setToggleFor(null)
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
    onError: (error) => {
      setToggleFor(null)
      notify(errorMessage(error), "error")
    },
  })

  const canModify = (target: User) =>
    !PRIVILEGED_TARGETS.includes(target.role) || hasRole(currentUser.role, PRIVILEGED_MANAGER_ROLES) || target.id === currentUser.id

  const sortBy = (key: SortKey) => {
    setOrdering((current) => (current === key ? `-${key}` : key))
    setPage(1)
  }
  const sortMark = (key: SortKey) => (ordering === key ? " ▲" : ordering === `-${key}` ? " ▼" : "")

  return (
    <div className="max-w-6xl">
      <PageHeader title="Пользователи" subtitle="Создание учётных записей, назначение ролей, активация и деактивация"
                  actions={<Button onClick={() => setCreating(true)}>+ Новый пользователь</Button>} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form className="flex items-end gap-2" role="search"
              onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); setPage(1) }}>
          <Input label="Поиск" placeholder="ФИО или логин" value={search} onChange={(e) => setSearch(e.target.value)} wrapperClassName="w-64" />
          <Button type="submit" variant="secondary">Найти</Button>
        </form>
        <Select label="Роль" placeholder="Все роли" options={ROLE_OPTIONS} value={role}
                onChange={(e) => { setRole(e.target.value); setPage(1) }} wrapperClassName="w-56" />
        <Select label="Статус" placeholder="Все" value={active} wrapperClassName="w-40"
                options={[{ value: "true", label: "Активные" }, { value: "false", label: "Деактивированные" }]}
                onChange={(e) => { setActive(e.target.value as "" | "true" | "false"); setPage(1) }} />
      </div>

      <QueryState isLoading={users.isLoading} error={users.error} onRetry={() => users.refetch()}>
        {users.data?.results.length === 0 ? (
          <EmptyState title="Пользователи не найдены" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3"><button type="button" onClick={() => sortBy("surname")}>ФИО{sortMark("surname")}</button></th>
                  <th className="px-4 py-3"><button type="button" onClick={() => sortBy("username")}>Логин{sortMark("username")}</button></th>
                  <th className="px-4 py-3"><button type="button" onClick={() => sortBy("role")}>Роль{sortMark("role")}</button></th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3"><button type="button" onClick={() => sortBy("last_login")}>Последний вход{sortMark("last_login")}</button></th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.data?.results.map((user) => (
                  <tr key={user.id} className={user.is_active ? "" : "bg-slate-50 text-slate-500"}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{user.full_name}</div>
                      {user.job_title && <div className="text-xs text-slate-500">{user.job_title}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{user.username}</td>
                    <td className="px-4 py-3">{user.role_display}</td>
                    <td className="px-4 py-3">
                      <Badge color={user.is_active ? "green" : "gray"}>{user.is_active ? "Активен" : "Деактивирован"}</Badge>
                    </td>
                    <td className="px-4 py-3">{formatDateTime(user.last_login)}</td>
                    <td className="px-4 py-3 text-right">
                      {canModify(user) && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(user)}>Изменить</Button>
                          <Button size="sm" variant="ghost" onClick={() => setPasswordFor(user)}>Пароль</Button>
                          {user.id !== currentUser.id && (
                            <Button size="sm" variant="ghost" className={user.is_active ? "text-red-600" : ""}
                                    onClick={() => setToggleFor(user)}>
                              {user.is_active ? "Деактивировать" : "Активировать"}
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users.data && <Pagination page={page} count={users.data.count} onChange={setPage} />}
      </QueryState>

      {creating && <UserFormModal onClose={() => setCreating(false)} />}
      {editing && <UserFormModal user={editing} onClose={() => setEditing(null)} />}
      {passwordFor && <SetPasswordModal user={passwordFor} onClose={() => setPasswordFor(null)} />}
      <ConfirmDialog
        open={toggleFor !== null}
        title={toggleFor?.is_active ? "Деактивация пользователя" : "Активация пользователя"}
        message={toggleFor?.is_active
          ? `Деактивировать «${toggleFor?.full_name}»? Пользователь не сможет войти, активные сеансы будут завершены.`
          : `Активировать «${toggleFor?.full_name}»?`}
        danger={toggleFor?.is_active}
        loading={toggle.isPending}
        onConfirm={() => toggleFor && toggle.mutate(toggleFor)}
        onClose={() => setToggleFor(null)}
      />
    </div>
  )
}

const FORM_FIELDS = ["username", "password", "surname", "firstname", "lastname", "birthdate", "role", "job_title", "speciality",
  "department", "employee_code"] as const
type UserForm = Record<(typeof FORM_FIELDS)[number], string>

export function validateUserForm(form: UserForm, isNew: boolean): Errors<keyof UserForm> {
  return {
    username: !form.username.trim() ? "Обязательное поле" : /^[\w.@+-]+$/.test(form.username) ? undefined : "Допустимы буквы, цифры и символы . @ + - _",
    password: isNew ? (form.password.length < 8 ? "Не менее 8 символов" : undefined) : undefined,
    surname: personName(form.surname),
    firstname: personName(form.firstname),
    lastname: personName(form.lastname, false),
    role: required(form.role),
  }
}

export function UserFormModal({ user, onClose }: { user?: User; onClose: () => void }) {
  const currentUser = useCurrentUser()
  const isNew = !user
  const queryClient = useQueryClient()
  const notify = useToast()
  const [form, setForm] = useState<UserForm>({
    username: user?.username ?? "", password: "", surname: user?.surname ?? "", firstname: user?.firstname ?? "",
    lastname: user?.lastname ?? "", birthdate: user?.birthdate ?? "", role: String(user?.role ?? Role.DOCTOR),
    job_title: user?.job_title ?? "", speciality: user?.speciality ?? "", department: user?.department ?? "",
    employee_code: user?.employee_code ?? "",
  })
  const [errors, setErrors] = useState<Errors<keyof UserForm>>({})
  const isSelf = user?.id === currentUser.id
  const roleOptions = ROLE_OPTIONS.filter(
    (option) => hasRole(currentUser.role, PRIVILEGED_MANAGER_ROLES) || !PRIVILEGED_TARGETS.includes(Number(option.value)) ||
      Number(option.value) === user?.role,
  )

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        username: form.username.trim(), surname: form.surname.trim(), firstname: form.firstname.trim(),
        lastname: form.lastname.trim(), birthdate: form.birthdate || null, role: Number(form.role) as Role,
        job_title: form.job_title, speciality: form.speciality, department: form.department, employee_code: form.employee_code,
      }
      return isNew ? usersApi.create({ ...payload, password: form.password } as UserCreate) : usersApi.update(user.id, payload)
    },
    onSuccess: () => {
      notify(isNew ? "Пользователь создан" : "Изменения сохранены")
      queryClient.invalidateQueries({ queryKey: ["users"] })
      onClose()
    },
    onError: (error) => error instanceof ApiError && setErrors(mergeServerErrors(FORM_FIELDS, error.errors)),
  })

  const set = (field: keyof UserForm) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [field]: event.target.value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateUserForm(form, isNew)
    setErrors(nextErrors)
    if (!hasErrors(nextErrors)) save.mutate()
  }
  const unknownServerError = save.error && !(save.error instanceof ApiError && Object.keys(mergeServerErrors(FORM_FIELDS, save.error.errors)).length)

  return (
    <Modal open title={isNew ? "Новый пользователь" : `Пользователь ${user.username}`} size="lg" onClose={onClose}
           footer={<>
             <Button variant="secondary" onClick={onClose}>Отмена</Button>
             <Button type="submit" form="user-form" loading={save.isPending}>{isNew ? "Создать" : "Сохранить"}</Button>
           </>}>
      <form id="user-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {unknownServerError && <div className="sm:col-span-2"><ErrorAlert error={save.error} /></div>}
        <Input label="Логин" required value={form.username} error={errors.username} onChange={set("username")} autoComplete="off" />
        {isNew ? (
          <Input label="Пароль" type="password" required value={form.password} error={errors.password}
                 hint="Не менее 8 символов, не только цифры" onChange={set("password")} autoComplete="new-password" />
        ) : <div />}
        <Input label="Фамилия" required value={form.surname} error={errors.surname} onChange={set("surname")} />
        <Input label="Имя" required value={form.firstname} error={errors.firstname} onChange={set("firstname")} />
        <Input label="Отчество" value={form.lastname} error={errors.lastname} onChange={set("lastname")} />
        <Input label="Дата рождения" type="date" value={form.birthdate} error={errors.birthdate} onChange={set("birthdate")} />
        <Select label="Роль" required options={roleOptions} value={form.role} error={errors.role} onChange={set("role")}
                disabled={isSelf} />
        <Input label="Должность" value={form.job_title} onChange={set("job_title")} />
        <Input label="Специальность" value={form.speciality} onChange={set("speciality")} />
        <Input label="Отделение" value={form.department} onChange={set("department")} />
        <Input label="Код сотрудника" value={form.employee_code} onChange={set("employee_code")} />
      </form>
    </Modal>
  )
}

function SetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const notify = useToast()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string>()
  const save = useMutation({
    mutationFn: () => usersApi.setPassword(user.id, password),
    onSuccess: () => {
      notify("Пароль установлен, сеансы пользователя завершены")
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.field("password") ?? err.message : errorMessage(err)),
  })
  return (
    <Modal open title={`Новый пароль: ${user.full_name}`} onClose={onClose}
           footer={<>
             <Button variant="secondary" onClick={onClose}>Отмена</Button>
             <Button loading={save.isPending} onClick={() => (password.length < 8 ? setError("Не менее 8 символов") : save.mutate())}>
               Установить
             </Button>
           </>}>
      <Input label="Новый пароль" type="password" value={password} error={error} autoComplete="new-password"
             onChange={(e) => setPassword(e.target.value)} />
    </Modal>
  )
}
