import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

type ToastKind = "success" | "error" | "info" | "warning"
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const notify = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current, { id, kind, message }])
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2 print:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
              { success: "bg-emerald-600", error: "bg-red-600", info: "bg-slate-800", warning: "bg-amber-600" }[item.kind]
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
