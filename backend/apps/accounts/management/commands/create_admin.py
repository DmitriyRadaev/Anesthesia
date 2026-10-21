import getpass
import os

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import Role, User


class Command(BaseCommand):
    help = (
        "Создаёт первого администратора. Пароль берётся из переменной окружения (--password-env) "
        "или запрашивается интерактивно; в аргументах командной строки пароль не передаётся."
    )

    def add_arguments(self, parser):
        parser.add_argument("--username", default=os.environ.get("DJANGO_ADMIN_USERNAME", "admin"))
        parser.add_argument("--surname", default="Администратор")
        parser.add_argument("--firstname", default="Системный")
        parser.add_argument("--password-env", default="DJANGO_ADMIN_PASSWORD",
                            help="Имя переменной окружения с паролем (по умолчанию DJANGO_ADMIN_PASSWORD)")
        parser.add_argument("--if-missing", action="store_true",
                            help="Ничего не делать, если пользователь уже существует (для автозапуска в Docker)")
        parser.add_argument("--superuser", action="store_true", help="Дополнительно дать доступ к /django-admin/")

    def handle(self, *args, **opts):
        username = opts["username"]
        if User.objects.filter(username=username).exists():
            if opts["if_missing"]:
                self.stdout.write(f"Пользователь «{username}» уже существует — пропуск.")
                return
            raise CommandError(f"Пользователь «{username}» уже существует.")

        password = os.environ.get(opts["password_env"]) or ""
        if not password:
            if opts["if_missing"]:
                self.stdout.write(self.style.WARNING(
                    f"Переменная {opts['password_env']} не задана — администратор не создан. "
                    "Выполните `python manage.py create_admin` вручную."))
                return
            password = getpass.getpass("Пароль администратора: ")
            if password != getpass.getpass("Повторите пароль: "):
                raise CommandError("Пароли не совпадают.")

        candidate = User(username=username, surname=opts["surname"], firstname=opts["firstname"], role=Role.ADMIN)
        try:
            password_validation.validate_password(password, candidate)
        except ValidationError as exc:
            raise CommandError("Пароль не прошёл проверку: " + " ".join(exc.messages))

        User.objects.create_user(
            username=username,
            password=password,
            surname=opts["surname"],
            firstname=opts["firstname"],
            role=Role.ADMIN,
            is_staff=opts["superuser"],
            is_superuser=opts["superuser"],
        )
        self.stdout.write(self.style.SUCCESS(f"Администратор «{username}» создан."))
