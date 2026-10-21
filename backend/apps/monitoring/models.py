from django.db import models


class HL7Result(models.Model):
    """Результат измерения, полученный от шлюза мониторов (HL7 ORU, режим result).

    `observations` — список словарей:
    ``{"observation_number": "...", "observation_name": "MDC_...", "observation_value": "...", "unit": "..."}``.
    """

    observation_at = models.DateTimeField("время измерения", db_index=True)
    pid = models.CharField("PID пациента", max_length=64, db_index=True)
    order_number = models.CharField("номер заказа", max_length=64)
    department = models.CharField("отделение", max_length=128, blank=True)
    room = models.CharField("палата", max_length=64, blank=True)
    bed = models.CharField("койка", max_length=64, blank=True)
    device = models.CharField("устройство", max_length=128, blank=True)
    observations = models.JSONField("показатели", default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "результат HL7"
        verbose_name_plural = "результаты HL7"
        ordering = ["observation_at"]
        constraints = [
            models.UniqueConstraint(fields=["observation_at", "pid", "order_number"], name="unique_hl7_observation")
        ]
        indexes = [models.Index(fields=["pid", "observation_at"])]

    def values(self) -> dict[str, str]:
        """Показатели в виде {observation_name: observation_value}."""
        return {item.get("observation_name"): item.get("observation_value") for item in self.observations or []}
