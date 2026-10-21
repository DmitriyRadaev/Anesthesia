from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.medicaments.importer import DEFAULT_FILE, import_medicaments
from apps.medicaments.models import Medicament, MedicamentGroup


class Command(BaseCommand):
    help = "Импорт справочника медикаментов из Excel (колонка A — наименование, B — ID группы)."

    def add_arguments(self, parser):
        parser.add_argument("path", nargs="?", type=Path, default=DEFAULT_FILE)
        parser.add_argument("--replace", action="store_true", help="Предварительно удалить все медикаменты")

    def handle(self, *args, path: Path, replace: bool, **options):
        if not path.is_file():
            raise CommandError(f"Файл не найден: {path}")
        try:
            created = import_medicaments(Medicament, MedicamentGroup, path, replace=replace)
        except ValueError as exc:
            raise CommandError(str(exc))
        self.stdout.write(self.style.SUCCESS(f"Импорт завершён: новых записей {created}, всего {Medicament.objects.count()}."))
