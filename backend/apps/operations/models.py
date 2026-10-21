from datetime import datetime
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.catalogs import models as catalogs
from apps.patients.models import Patient


class Operation(models.Model):
    """Операционный случай (ОС)."""

    class Status(models.IntegerChoices):
        ARRIVED = 1, "Поступил"
        ON_OPERATION = 2, "На операции"
        FINISHED = 3, "Завершён"
        CANCELLED = 4, "Отменён"

    ACTIVE_STATUSES = (Status.ARRIVED, Status.ON_OPERATION)

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="operations", verbose_name="пациент")
    status = models.PositiveSmallIntegerField("статус", choices=Status.choices, default=Status.ARRIVED)
    operation_date = models.DateField("дата операции", null=True, blank=True)
    operation_time = models.TimeField("время поступления в операционную", null=True, blank=True)
    pid = models.CharField("PID пациента в мониторах", max_length=64, blank=True)

    operation_name = models.CharField("наименование операции", max_length=500)
    operation_code = models.CharField("код операции", max_length=64, blank=True)
    federal_code = models.CharField("федеральный код", max_length=64, blank=True)
    diagnosis = models.ForeignKey(catalogs.Diagnosis, on_delete=models.SET_NULL, null=True, blank=True,
                                  verbose_name="диагноз (МКБ-10)")
    diagnosis_name = models.CharField("диагноз", max_length=500, blank=True)
    history_number = models.CharField("номер истории болезни", max_length=64, blank=True)

    type_operation = models.ForeignKey(catalogs.TypeOperation, on_delete=models.PROTECT, verbose_name="тип операции")
    asa = models.ForeignKey(catalogs.Asa, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="ASA")
    volume_operation = models.ForeignKey(catalogs.VolumeOperation, on_delete=models.SET_NULL, null=True, blank=True,
                                         verbose_name="объём операции")
    department = models.ForeignKey(catalogs.Department, on_delete=models.SET_NULL, null=True, blank=True,
                                   verbose_name="отделение")
    ventilator = models.ForeignKey(catalogs.Ventilator, on_delete=models.SET_NULL, null=True, blank=True,
                                   verbose_name="аппарат ИВЛ")
    monitoring = models.ForeignKey(catalogs.Monitoring, on_delete=models.SET_NULL, null=True, blank=True,
                                   verbose_name="монитор")

    complaints_patient = models.TextField("жалобы пациента", blank=True)
    features_anamnesis = models.TextField("особенности анамнеза", blank=True)
    drug_intolerance = models.TextField("непереносимость препаратов", blank=True)
    height = models.DecimalField("рост, см", max_digits=5, decimal_places=1, null=True, blank=True,
                                 validators=[MinValueValidator(Decimal(1)), MaxValueValidator(Decimal(300))])
    weight = models.DecimalField("вес, кг", max_digits=5, decimal_places=1, null=True, blank=True,
                                 validators=[MinValueValidator(Decimal(1)), MaxValueValidator(Decimal(300))])
    reason_cancel = models.TextField("причина отмены", blank=True)

    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name="operations_as_doctor", verbose_name="врач-анестезиолог")
    nurse = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="operations_as_nurse", verbose_name="медсестра-анестезист")

    created_at = models.DateTimeField("создан", auto_now_add=True)
    updated_at = models.DateTimeField("изменён", auto_now=True)

    class Meta:
        verbose_name = "операционный случай"
        verbose_name_plural = "операционные случаи"
        ordering = ["status", "-operation_date", "-operation_time", "-id"]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["pid"]), models.Index(fields=["operation_date"])]

    def __str__(self) -> str:
        return f"ОС №{self.pk}: {self.operation_name}"

    @property
    def bmi(self) -> float | None:
        """Индекс массы тела (в исходной системе — поле `imt`)."""
        if not self.height or not self.weight:
            return None
        meters = float(self.height) / 100
        return round(float(self.weight) / (meters * meters), 1)

    @property
    def arrival_datetime(self) -> datetime | None:
        """Дата и время поступления как aware-datetime в часовом поясе учреждения."""
        if self.operation_date is None or self.operation_time is None:
            return None
        return timezone.make_aware(datetime.combine(self.operation_date, self.operation_time))

    def has_action(self, value: str) -> bool:
        return self.anesthetic_actions.filter(value=value).exists()

    def action_time(self, value: str) -> datetime | None:
        return self.anesthetic_actions.filter(value=value).order_by("time").values_list("time", flat=True).first()
