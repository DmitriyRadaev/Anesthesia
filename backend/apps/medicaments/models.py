from django.db import models


class MedicamentGroup(models.Model):
    name = models.CharField("наименование", max_length=255)

    class Meta:
        verbose_name = "группа медикаментов"
        verbose_name_plural = "группы медикаментов"
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name


class Medicament(models.Model):
    name = models.CharField("наименование", max_length=500, db_index=True)
    group = models.ForeignKey(MedicamentGroup, on_delete=models.PROTECT, related_name="medicaments",
                              verbose_name="группа")

    class Meta:
        verbose_name = "медикамент"
        verbose_name_plural = "медикаменты"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["name"], name="unique_medicament_name")]

    def __str__(self) -> str:
        return self.name
