import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import models
from django.utils import timezone

from apps.common.validators import person_name_validator


class Role(models.IntegerChoices):
    """Роли пользователей (идентификаторы совпадают с исходной системой)."""

    DOCTOR = 1, "Врач"
    NURSE = 2, "Медсестра/Медбрат"
    ADMIN = 3, "Администратор"
    HEAD = 4, "Заведующий отделением"
    ACTING_HEAD = 5, "ИО заведующего отделением"


CLINICAL_ROLES = frozenset({Role.DOCTOR, Role.NURSE, Role.HEAD, Role.ACTING_HEAD})
SUPERVISOR_ROLES = frozenset({Role.HEAD, Role.ACTING_HEAD})
USER_MANAGER_ROLES = frozenset({Role.ADMIN, Role.HEAD, Role.ACTING_HEAD})
REPORT_ROLES = frozenset({Role.ADMIN, Role.HEAD, Role.ACTING_HEAD})
# Роли, которые могут назначать роли руководителей и изменять учётные записи руководителей/администраторов.
PRIVILEGED_MANAGER_ROLES = frozenset({Role.ADMIN, Role.HEAD})
PRIVILEGED_TARGET_ROLES = frozenset({Role.ADMIN, Role.HEAD, Role.ACTING_HEAD})


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError("Логин обязателен")
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault("role", Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(username, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Пользователь системы. Аутентификация — локальная (логин + хеш пароля)."""

    username = models.CharField(
        "логин", max_length=150, unique=True, validators=[UnicodeUsernameValidator()],
        error_messages={"unique": "Пользователь с таким логином уже существует."},
    )
    surname = models.CharField("фамилия", max_length=150, validators=[person_name_validator])
    firstname = models.CharField("имя", max_length=150, validators=[person_name_validator])
    lastname = models.CharField("отчество", max_length=150, blank=True, validators=[person_name_validator])
    birthdate = models.DateField("дата рождения", null=True, blank=True)
    role = models.PositiveSmallIntegerField("роль", choices=Role.choices, default=Role.DOCTOR)
    employee_code = models.CharField("код сотрудника", max_length=64, blank=True)
    speciality = models.CharField("специальность", max_length=255, blank=True)
    department = models.CharField("отделение", max_length=255, blank=True)
    job_title = models.CharField("должность", max_length=255, blank=True)
    is_active = models.BooleanField("активен", default=True)
    is_staff = models.BooleanField("доступ к django-admin", default=False)
    created_at = models.DateTimeField("создан", auto_now_add=True)
    updated_at = models.DateTimeField("изменён", auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["surname", "firstname"]

    class Meta:
        verbose_name = "пользователь"
        verbose_name_plural = "пользователи"
        ordering = ["-is_active", "surname", "firstname"]
        indexes = [models.Index(fields=["role", "is_active"])]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.username})"

    @property
    def full_name(self) -> str:
        return " ".join(part for part in (self.surname, self.firstname, self.lastname) if part)

    def has_role(self, *roles) -> bool:
        return self.role in roles

    @property
    def is_clinical(self) -> bool:
        return self.role in CLINICAL_ROLES

    @property
    def is_supervisor(self) -> bool:
        return self.role in SUPERVISOR_ROLES

    @property
    def can_manage_users(self) -> bool:
        return self.role in USER_MANAGER_ROLES


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


class AuthTokenManager(models.Manager):
    def issue(self, user: User) -> tuple["AuthToken", str]:
        """Создаёт токен и возвращает (запись, открытый ключ). Открытый ключ в БД не хранится."""
        raw_key = secrets.token_urlsafe(32)
        ttl = settings.AUTH_TOKEN_TTL_HOURS
        expires_at = timezone.now() + timedelta(hours=ttl) if ttl else None
        token = self.create(user=user, key_hash=_hash_key(raw_key), expires_at=expires_at)
        return token, raw_key

    def get_by_raw_key(self, raw_key: str) -> "AuthToken":
        return self.select_related("user").get(key_hash=_hash_key(raw_key))


class AuthToken(models.Model):
    """Токен доступа. Хранится только SHA-256 хеш ключа; у пользователя может быть несколько сессий."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="auth_tokens", verbose_name="пользователь")
    key_hash = models.CharField("хеш ключа", max_length=64, unique=True)
    created_at = models.DateTimeField("создан", auto_now_add=True)
    expires_at = models.DateTimeField("истекает", null=True, blank=True)
    last_used_at = models.DateTimeField("последнее использование", null=True, blank=True)

    objects = AuthTokenManager()

    class Meta:
        verbose_name = "токен доступа"
        verbose_name_plural = "токены доступа"

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and self.expires_at <= timezone.now()
