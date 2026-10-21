from django.db import migrations


def load(apps, schema_editor):
    from apps.medicaments.importer import import_medicaments

    import_medicaments(apps.get_model("medicaments", "Medicament"), apps.get_model("medicaments", "MedicamentGroup"))


class Migration(migrations.Migration):
    dependencies = [("medicaments", "0001_initial")]

    operations = [migrations.RunPython(load, migrations.RunPython.noop)]
