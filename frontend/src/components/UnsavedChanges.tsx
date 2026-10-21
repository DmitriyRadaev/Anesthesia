import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "./ui/Button"
import { Modal } from "./ui/Modal"

interface UnsavedContext {
  setDirty: (id: string, dirty: boolean) => void
  /** Выполнить действие (выход, переход) — с подтверждением, если есть несохранённые изменения. */
  confirmLeave: (action: () => void) => void
}

const Context = createContext<UnsavedContext>({ setDirty: () => undefined, confirmLeave: (action) => action() })

/**
 * Защита от потери несохранённых данных (модальное окно «Сохранение» исходной системы): переход по ссылке внутри
 * приложения, выход из системы и закрытие вкладки при несохранённых изменениях требуют подтверждения.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<string>())
  const navigate = useNavigate()
  const [pending, setPending] = useState<(() => void) | null>(null)

  const setDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id)
    else dirty.current.delete(id)
  }, [])
  const confirmLeave = useCallback((action: () => void) => {
    if (dirty.current.size === 0) action()
    else setPending(() => action)
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (dirty.current.size === 0 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // якоря на той же странице (оглавление протокола) не уводят со страницы
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      event.preventDefault()
      event.stopPropagation()
      setPending(() => () => navigate(url.pathname + url.search + url.hash))
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size > 0) event.preventDefault()
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [navigate])

  const leave = () => {
    const action = pending
    dirty.current.clear()
    setPending(null)
    action?.()
  }

  return (
    <Context.Provider value={{ setDirty, confirmLeave }}>
      {children}
      <Modal
        open={pending !== null}
        title="Сохранение"
        onClose={() => setPending(null)}
        footer={
          <>
            <Button onClick={() => setPending(null)}>Остаться на странице</Button>
            <Button variant="secondary" onClick={leave}>Перейти без сохранения</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">На странице есть несохранённые изменения. Они будут потеряны.</p>
      </Modal>
    </Context.Provider>
  )
}

/** Сообщить, что на странице (блоке) есть несохранённые изменения. */
export function useUnsavedChanges(isDirty: boolean) {
  const { setDirty } = useContext(Context)
  const id = useId()
  useEffect(() => {
    setDirty(id, isDirty)
    return () => setDirty(id, false)
  }, [id, isDirty, setDirty])
}

export const useConfirmLeave = () => useContext(Context).confirmLeave
