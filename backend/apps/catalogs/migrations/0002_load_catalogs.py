from django.db import migrations


def load(apps, schema_editor):
    from apps.catalogs.loader import load_catalogs

    load_catalogs(apps, schema_editor)


class Migration(migrations.Migration):
    dependencies = [("catalogs", "0001_initial")]

    operations = [migrations.RunPython(load, migrations.RunPython.noop)]
