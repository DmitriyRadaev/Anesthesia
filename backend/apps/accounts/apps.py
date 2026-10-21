from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"
    verbose_name = "Пользователи и авторизация"

    def ready(self):
        from . import (
            authentication,  # noqa: F401  регистрация схемы авторизации в drf-spectacular
        )
