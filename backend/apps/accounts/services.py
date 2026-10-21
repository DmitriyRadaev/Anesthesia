"""Бизнес-правила управления пользователями."""
from rest_framework.exceptions import PermissionDenied

from .models import PRIVILEGED_MANAGER_ROLES, PRIVILEGED_TARGET_ROLES, User


def ensure_can_assign_role(actor: User, role: int) -> None:
    """Назначать роли руководителей и администратора могут только Администратор и Заведующий."""
    if role in PRIVILEGED_TARGET_ROLES and actor.role not in PRIVILEGED_MANAGER_ROLES:
        raise PermissionDenied("Недостаточно прав для назначения этой роли.")


def ensure_can_modify(actor: User, target: User, *, new_role: int | None = None, new_active: bool | None = None) -> None:
    """Проверяет, может ли `actor` изменить учётную запись `target`."""
    if target.role in PRIVILEGED_TARGET_ROLES and actor.role not in PRIVILEGED_MANAGER_ROLES and actor.pk != target.pk:
        raise PermissionDenied("Недостаточно прав для изменения учётной записи руководителя или администратора.")
    if new_role is not None and new_role != target.role:
        if actor.pk == target.pk:
            raise PermissionDenied("Нельзя изменить собственную роль.")
        ensure_can_assign_role(actor, new_role)
    if new_active is False and actor.pk == target.pk:
        raise PermissionDenied("Нельзя деактивировать собственную учётную запись.")
