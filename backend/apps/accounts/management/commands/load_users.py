import json
import secrets
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Role, User

ROLE_CODES = {
    "doctor": Role.DOCTOR,
    "nurse": Role.NURSE,
    "admin": Role.ADMIN,
    "head": Role.HEAD,
    "acting_head": Role.ACTING_HEAD,
}


class Command(BaseCommand):
    help = (
        "Создаёт (или обновляет) заранее подготовленных пользователей из JSON-файла. "
        "Если пароль в файле не указан, генерируется случайный и выводится однократно. "
        "Пример файла: backend/data/users.example.json. Файл с реальными данными не хранится в репозитории."
    )

    def add_arguments(self, parser):
        parser.add_argument("path", type=Path)
        parser.add_argument("--update", action="store_true", help="Обновлять профиль/роль существующих пользователей")

    @transaction.atomic
    def handle(self, *args, path: Path, update: bool, **opts):
        if not path.is_file():
            raise CommandError(f"Файл не найден: {path}")
        try:
            records = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Некорректный JSON: {exc}")

        generated = []
        for record in records:
            record = dict(record)
            username = record.pop("username")
            role = record.pop("role", "doctor")
            if role not in ROLE_CODES:
                raise CommandError(f"Неизвестная роль «{role}» у пользователя {username}")
            record["role"] = ROLE_CODES[role]
            password = record.pop("password", None)

            user = User.objects.filter(username=username).first()
            if user is None:
                if not password:
                    password = secrets.token_urlsafe(12)
                    generated.append((username, password))
                User.objects.create_user(username=username, password=password, **record)
                self.stdout.write(self.style.SUCCESS(f"+ {username}"))
            elif update:
                for field, value in record.items():
                    setattr(user, field, value)
                if password:
                    user.set_password(password)
                user.full_clean(exclude=["password"])
                user.save()
                self.stdout.write(f"~ {username} (обновлён)")
            else:
                self.stdout.write(f"= {username} (уже существует)")

        if generated:
            self.stdout.write(self.style.WARNING("\nСгенерированные пароли (показываются один раз, передайте пользователям "
                                                 "по защищённому каналу и попросите сменить):"))
            for username, password in generated:
                self.stdout.write(f"  {username}: {password}")
