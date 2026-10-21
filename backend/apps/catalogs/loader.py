"""Загрузка справочников из JSON-фикстур (data/catalogs/*.json). Используется data-миграцией."""
import json
from pathlib import Path

from django.conf import settings
from django.core.management.color import no_style
from django.db import connection

from .registry import FIELD_RENAMES, FIXTURES

FIXTURES_DIR = Path(settings.BASE_DIR) / "data" / "catalogs"


def read_fixture(name: str) -> list[dict]:
    rows = json.loads((FIXTURES_DIR / f"{name}.json").read_text(encoding="utf-8"))
    return [{FIELD_RENAMES.get(key, key): value for key, value in row.items()} for row in rows]


def load_catalogs(apps, schema_editor=None) -> None:
    """Идемпотентно загружает все справочники (существующие записи обновляются по id)."""
    models = []
    for fixture, model_name in FIXTURES:
        model = apps.get_model("catalogs", model_name)
        fields = {f.attname for f in model._meta.concrete_fields}
        for row in read_fixture(fixture):
            data = {k: ("" if v is None else v) for k, v in row.items() if k in fields and k != "id"}
            model.objects.update_or_create(id=row["id"], defaults=data)
        models.append(model)
    _reset_sequences(models)


def _reset_sequences(models) -> None:
    statements = connection.ops.sequence_reset_sql(no_style(), models)
    with connection.cursor() as cursor:
        for sql in statements:
            cursor.execute(sql)
