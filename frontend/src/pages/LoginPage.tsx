import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
import { homePathFor } from "../auth/roles"
import { Button } from "../components/ui/Button"
import { ErrorAlert } from "../components/ui/Feedback"
import { Input } from "../components/ui/Form"

export function LoginPage() {
  const { status, user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === "authenticated" && user) return <Navigate to={homePathFor(user.role)} replace />

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = {
      username: username.trim() ? undefined : "Введите логин",
      password: password ? undefined : "Введите пароль",
    }
    setErrors(nextErrors)
    if (nextErrors.username || nextErrors.password) return
    setSubmitting(true)
    setError(null)
    try {
      const loggedIn = await login(username.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== "/login" ? from : homePathFor(loggedIn.role), { replace: true })
    } catch (err) {
      setError(err)
      setPassword("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">АРМ Анестезиология</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в систему</p>
        </div>
        {error !== null && <ErrorAlert error={error} />}
        <Input
          label="Логин"
          autoComplete="username"
          value={username}
          error={errors.username}
          onChange={(event) => setUsername(event.target.value)}
          autoFocus
        />
        <Input
          label="Пароль"
          type="password"
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Войти
        </Button>
      </form>
    </div>
  )
}
