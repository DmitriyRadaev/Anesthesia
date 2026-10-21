import { Link } from "react-router-dom"
import { EmptyState } from "../components/ui/Feedback"

export function ForbiddenPage() {
  return (
    <EmptyState
      title="Доступ запрещён"
      description="У вашей роли недостаточно прав для просмотра этой страницы."
      action={<Link className="text-sm font-medium text-brand-700" to="/">На главную</Link>}
    />
  )
}

export function NotFoundPage() {
  return (
    <EmptyState
      title="Страница не найдена"
      action={<Link className="text-sm font-medium text-brand-700" to="/">На главную</Link>}
    />
  )
}
