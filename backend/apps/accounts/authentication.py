from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .models import AuthToken

# Обновлять отметку last_used_at не чаще, чем раз в N секунд (снижение нагрузки на БД).
_LAST_USED_RESOLUTION_SECONDS = 60


class ExpiringTokenAuthentication(BaseAuthentication):
    """Заголовок `Authorization: Bearer <token>`; токен имеет ограниченный срок жизни."""

    keyword = "Bearer"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None
        if len(auth) != 2:
            raise exceptions.AuthenticationFailed(_("Некорректный заголовок авторизации."))
        try:
            raw_key = auth[1].decode()
        except UnicodeError:
            raise exceptions.AuthenticationFailed(_("Некорректный токен."))
        return self.authenticate_credentials(raw_key)

    def authenticate_credentials(self, raw_key: str):
        try:
            token = AuthToken.objects.get_by_raw_key(raw_key)
        except AuthToken.DoesNotExist:
            raise exceptions.AuthenticationFailed(_("Недействительный токен."))
        if token.is_expired:
            token.delete()
            raise exceptions.AuthenticationFailed(_("Срок действия токена истёк. Выполните вход повторно."))
        if not token.user.is_active:
            raise exceptions.AuthenticationFailed(_("Учётная запись деактивирована."))

        now = timezone.now()
        if token.last_used_at is None or (now - token.last_used_at).total_seconds() > _LAST_USED_RESOLUTION_SECONDS:
            AuthToken.objects.filter(pk=token.pk).update(last_used_at=now)
        return token.user, token

    def authenticate_header(self, request):
        return self.keyword


class ExpiringTokenScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.ExpiringTokenAuthentication"
    name = "BearerAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "description": "Токен из `POST /api/auth/login/`.",
        }
