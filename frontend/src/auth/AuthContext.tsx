import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { onUnauthorized, tokenStorage } from "../api/client"
import { authApi } from "../api/endpoints"
import type { User } from "../api/types"

type AuthStatus = "loading" | "authenticated" | "anonymous"

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  login: (username: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(tokenStorage.get() ? "loading" : "anonymous")

  const reset = useCallback(() => {
    tokenStorage.clear()
    setUser(null)
    setStatus("anonymous")
    queryClient.clear()
  }, [queryClient])

  // Восстановление сессии по сохранённому токену.
  useEffect(() => {
    if (!tokenStorage.get()) return
    authApi
      .me()
      .then((me) => {
        setUser(me)
        setStatus("authenticated")
      })
      .catch(reset)
  }, [reset])

  // Любой ответ 401 (истёк токен, пользователь деактивирован) завершает сессию.
  useEffect(() => {
    onUnauthorized(reset)
    return () => onUnauthorized(null)
  }, [reset])

  const login = useCallback(async (username: string, password: string) => {
    const response = await authApi.login(username, password)
    tokenStorage.set(response.token)
    setUser(response.user)
    setStatus("authenticated")
    return response.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      reset()
    }
  }, [reset])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}

/** Текущий пользователь на защищённых страницах (гарантированно не null). */
export function useCurrentUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error("useCurrentUser must be used on protected routes")
  return user
}
