export function Spinner({ label = "Загрузка…", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center gap-3 text-slate-500 ${className}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
