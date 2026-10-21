import { useState, type FormEvent } from "react"
import { ApiError } from "../api/client"
import { authApi } from "../api/endpoints"
import { useCurrentUser } from "../auth/AuthContext"
import { ROLE_LABELS } from "../auth/roles"
import { Button } from "../components/ui/Button"
import { ErrorAlert } from "../components/ui/Feedback"
import { Input } from "../components/ui/Form"
import { Card, DefinitionList, PageHeader } from "../components/ui/Misc"
import { useToast } from "../components/ui/Toast"
import { formatDate, formatDateTime } from "../utils/format"

export function ProfilePage() {
  const user = useCurrentUser()
  const notify = useToast()
  const [oldPassword, setOldPassword] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirm) {
      setError(new ApiError(400, "Пароли не совпадают", "invalid", { confirm: ["Пароли не совпадают"] }))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await authApi.changePassword(oldPassword, password)
      setOldPassword("")
      setPassword("")
      setConfirm("")
      notify("Пароль изменён. Остальные сеансы завершены.")
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (name: string) => (error instanceof ApiError ? error.field(name) : undefined)

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Профиль" subtitle={ROLE_LABELS[user.role]} />
      <Card title="Учётная запись">
        <DefinitionList
          items={[
            ["ФИО", user.full_name],
            ["Логин", user.username],
            ["Дата рождения", formatDate(user.birthdate)],
            ["Должность", user.job_title || "—"],
            ["Последний вход", formatDateTime(user.last_login)],
          ]}
        />
      </Card>
      <Card title="Смена пароля">
        <form onSubmit={submit} className="grid gap-4 sm:max-w-sm">
          {error !== null && !fieldError("old_password") && !fieldError("password") && !fieldError("confirm") && (
            <ErrorAlert error={error} />
          )}
          <Input label="Текущий пароль" type="password" value={oldPassword} autoComplete="current-password"
                 error={fieldError("old_password")} onChange={(e) => setOldPassword(e.target.value)} required />
          <Input label="Новый пароль" type="password" value={password} autoComplete="new-password"
                 hint="Не менее 8 символов, не только цифры" error={fieldError("password")}
                 onChange={(e) => setPassword(e.target.value)} required />
          <Input label="Повторите пароль" type="password" value={confirm} autoComplete="new-password"
                 error={fieldError("confirm")} onChange={(e) => setConfirm(e.target.value)} required />
          <div>
            <Button type="submit" loading={saving}>Сменить пароль</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
