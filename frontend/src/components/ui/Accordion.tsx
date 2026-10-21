import { useEffect, useId, useState, type ReactNode } from "react"

/** Раскрывающийся блок страницы в стиле исходной системы (заголовок, пунктирный разделитель). */
export function Accordion({ title, children, defaultOpen = false, level = "nested", id }: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  level?: "main" | "nested"
  id?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  // переход по оглавлению (#id) раскрывает блок, как в исходной системе
  useEffect(() => {
    if (!id) return
    const sync = () => {
      if (window.location.hash !== `#${id}`) return
      setOpen(true)
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }))
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [id])
  return (
    <section className="mt-5 scroll-mt-6" id={id}>
      <h2 className={level === "main" ? "text-2xl font-medium text-slate-700" : "text-xl font-medium text-slate-400"}>
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between text-left">
          {title}
          <svg width="24" height="24" viewBox="0 0 24 24" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" fill="#5068a5" />
          </svg>
        </button>
      </h2>
      <hr className="mb-[5px] mt-1 border-t border-dashed border-slate-200" />
      {open && <div id={panelId} className="pt-2">{children}</div>}
    </section>
  )
}
