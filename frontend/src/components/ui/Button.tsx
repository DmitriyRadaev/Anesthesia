import { Link } from "react-router-dom"
import type { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "primary" | "secondary" | "danger" | "ghost"

const VARIANTS: Record<Variant, string> = {
  primary: "bg-app-primary text-white shadow-button hover:bg-app-primary-hover disabled:bg-none disabled:bg-white disabled:text-slate-300 disabled:shadow-none disabled:ring-1 disabled:ring-slate-200",
  secondary: "bg-app-secondary text-slate-700 shadow-button hover:bg-app-primary hover:text-white disabled:text-slate-300 disabled:shadow-none",
  danger: "bg-red-500 text-white shadow-button hover:bg-red-600 disabled:bg-red-200",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:text-slate-300",
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: "sm" | "md"
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = "primary", size = "md", loading, icon, children, className = "", disabled, ...rest }: Props) {
  const sizing = size === "sm" ? "px-3 py-1 text-xs" : "h-[38px] px-5 text-sm"
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-[20px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  )
}

interface LinkButtonProps {
  to: string
  variant?: Variant
  size?: "sm" | "md"
  children: ReactNode
  className?: string
}

/** Ссылка, оформленная как кнопка (навигация без вложенных интерактивных элементов). */
export function LinkButton({ to, variant = "secondary", size = "md", children, className = "" }: LinkButtonProps) {
  const sizing = size === "sm" ? "px-3 py-1 text-xs" : "h-[38px] px-5 text-sm"
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-[20px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${sizing} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}
