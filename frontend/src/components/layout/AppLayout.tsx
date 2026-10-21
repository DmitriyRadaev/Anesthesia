import { useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import arrowSvg from "../../assets/nav/arrowsideMenu.svg?raw"
import avatarSvg from "../../assets/nav/AvaAccount.svg?raw"
import exitSvg from "../../assets/nav/ExitAccount.svg?raw"
import myPatientsSvg from "../../assets/nav/MyPatients.svg?raw"
import adminSvg from "../../assets/nav/NavigateAdmin.svg?raw"
import reportsSvg from "../../assets/nav/NavigateHead.svg?raw"
import allPatientsSvg from "../../assets/nav/OverallPatients.svg?raw"
import { useAuth, useCurrentUser } from "../../auth/AuthContext"
import { CLINICAL_ROLES, hasRole, REPORT_ROLES, ROLE_LABELS, USER_MANAGER_ROLES } from "../../auth/roles"
import { Svg } from "../ui/Svg"
import { UnsavedChangesProvider, useConfirmLeave } from "../UnsavedChanges"

interface NavItem {
  to: string
  label: string
  icon: string
  isActive: (pathname: string, search: URLSearchParams) => boolean
}

const DRAWER_KEY = "drawer-open"
const readDrawer = () => {
  try {
    return localStorage.getItem(DRAWER_KEY) !== "0"
  } catch {
    return true
  }
}

export function AppLayout() {
  return (
    <UnsavedChangesProvider>
      <Shell />
    </UnsavedChangesProvider>
  )
}

/** Каркас приложения: выдвижная боковая панель исходной системы (свёрнутая — только иконки) и область страницы. */
function Shell() {
  const user = useCurrentUser()
  const confirmLeave = useConfirmLeave()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  const [open, setOpen] = useState(readDrawer)

  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(DRAWER_KEY, open ? "0" : "1")
    } catch {
      // настройка панели необязательна
    }
  }

  const items: NavItem[] = []
  if (hasRole(user.role, CLINICAL_ROLES)) {
    items.push(
      { to: "/patients?mine=1", label: "Мои пациенты", icon: myPatientsSvg, isActive: (p, s) => p.startsWith("/patients") && Boolean(s.get("mine")) },
      { to: "/patients", label: "Все пациенты", icon: allPatientsSvg, isActive: (p, s) => p.startsWith("/patients") && !s.get("mine") },
    )
  }
  if (hasRole(user.role, USER_MANAGER_ROLES)) {
    items.push({ to: "/admin/users", label: "Пользователи", icon: adminSvg, isActive: (p) => p.startsWith("/admin") })
  }
  if (hasRole(user.role, REPORT_ROLES)) items.push({ to: "/reports", label: "Отчёты", icon: reportsSvg, isActive: (p) => p.startsWith("/reports") })

  const handleLogout = async () => {
    await logout()
    navigate("/login", { replace: true })
  }

  const fade = `whitespace-nowrap transition-opacity duration-500 ${open ? "opacity-100" : "pointer-events-none w-0 opacity-0"}`

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed left-0 top-0 z-40 flex h-[98%] flex-col justify-between gap-5 rounded-r-lg bg-app-secondary px-5 py-2.5 font-medium shadow-[0_0_40px_rgba(84,109,139,0.37)] transition-all duration-700 print:hidden ${open ? "w-[236px]" : "w-[90px]"}`}
        aria-label="Боковая панель"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-4 overflow-hidden">
            <Svg src={avatarSvg} className="shrink-0" />
            <NavLink to="/profile" className={`flex min-w-0 flex-col text-sm text-slate-700 ${fade}`} title="Профиль">
              <span className="truncate font-normal">{user.surname}</span>
              <span className="truncate font-normal">{user.firstname}</span>
              <span className="truncate font-normal">{user.lastname}</span>
              <span className="truncate text-xs uppercase text-slate-400">{ROLE_LABELS[user.role]}</span>
            </NavLink>
          </div>
          <nav className="mt-12 overflow-hidden" aria-label="Основная навигация">
            {items.map((item) => {
              const active = item.isActive(location.pathname, search)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-[45px] items-center gap-3 border-b border-slate-200 py-[7px] text-sm text-slate-700 ${open ? "" : "justify-center"}`}
                >
                  <Svg src={item.icon} className="shrink-0" />
                  <span className={`${fade} ${active ? "underline decoration-slate-700 underline-offset-4" : ""}`}>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => confirmLeave(handleLogout)}
          aria-label="Выйти"
          className={`mb-2 flex h-8 items-center justify-center gap-2 self-center rounded-[20px] bg-app-primary px-2.5 text-sm text-white transition-all duration-700 ${open ? "w-[143px]" : "w-[35px]"}`}
        >
          <Svg src={exitSvg} className="shrink-0" />
          <span className={fade}>Выход</span>
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "Свернуть панель" : "Развернуть панель"}
          aria-expanded={open}
          className="absolute -right-7 top-2.5 flex h-[50px] w-7 items-center justify-center rounded-r-md bg-[#e6eaf6]"
        >
          <Svg src={arrowSvg} className={`transition-transform duration-300 ${open ? "" : "rotate-180"}`} />
        </button>
      </aside>
      <main className={`min-w-0 px-6 py-8 transition-[padding] duration-700 print:!p-0 ${open ? "lg:pl-[290px]" : "pl-[130px]"} pl-[130px]`}>
        <div className="mx-auto max-w-[1100px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
