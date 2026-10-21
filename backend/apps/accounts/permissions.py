"""Ролевая модель доступа. Матрица прав описана в docs/AUTH.md."""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import CLINICAL_ROLES, REPORT_ROLES, USER_MANAGER_ROLES, Role


class HasRole(BasePermission):
    """Базовое разрешение: пользователь аутентифицирован и имеет одну из ролей `roles`."""

    roles: frozenset = frozenset()
    message = "Доступ запрещён. У вас недостаточно прав для выполнения действия."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.roles)


class IsClinicalStaff(HasRole):
    """Врач, медсестра, заведующий, ИО заведующего — работа с медицинскими данными."""

    roles = CLINICAL_ROLES


class CanManageUsers(HasRole):
    """Администратор, заведующий, ИО заведующего — управление пользователями."""

    roles = USER_MANAGER_ROLES


class CanViewReports(HasRole):
    roles = REPORT_ROLES


class PatientAccess(HasRole):
    """Чтение — клинический персонал; изменение — врач и руководители; удаление — руководители."""

    roles = CLINICAL_ROLES
    write_roles = frozenset({Role.DOCTOR, Role.HEAD, Role.ACTING_HEAD})
    delete_roles = frozenset({Role.HEAD, Role.ACTING_HEAD})

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.method == "DELETE":
            return request.user.role in self.delete_roles
        return request.user.role in self.write_roles
