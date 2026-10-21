import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import type { Role } from "../api/types"
import { Spinner } from "../components/ui/Spinner"
import { useAuth } from "./AuthContext"
import { hasRole } from "./roles"

interface Props {
  children: ReactNode
  roles?: Role[]
}

export function ProtectedRoute({ children, roles }: Props) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner label="Проверка сессии…" />
      </div>
    )
  }
  if (status === "anonymous" || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (roles && !hasRole(user.role, roles)) {
    return <Navigate to="/forbidden" replace />
  }
  return <>{children}</>
}
