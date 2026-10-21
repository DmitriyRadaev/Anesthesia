from django.conf import settings
from django.db import models


class LabResult(models.Model):
    """Результаты лабораторного мониторинга по операционному случаю (структура — labs/schema.py)."""

    operation = models.OneToOneField("operations.Operation", on_delete=models.CASCADE, related_name="lab_result")
    values = models.JSONField("показатели", default=dict, blank=True)
    updated_at = models.DateTimeField("изменено", auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+", verbose_name="изменил")

    class Meta:
        verbose_name = "лабораторный мониторинг"
        verbose_name_plural = "лабораторный мониторинг"
