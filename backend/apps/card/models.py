"""Наркозная карта: данные, привязанные ко времени в ходе анестезии."""
from django.core.validators import MinValueValidator
from django.db import models

from apps.catalogs.models import MeasurementUnit


class AnestheticAction(models.Model):
    """Анестезиологическое действие (пиктограмма на временной шкале)."""

    class Value(models.TextChoices):
        ANESTHESIA_START = "ANESTHESIA_START", "Начало анестезии"
        ANESTHESIA_STOP = "ANESTHESIA_STOP", "Окончание анестезии"
        INTUBATION = "INTUBATION", "Интубация трахеи"
        EXTUBATION = "EXTUBATION", "Экстубация трахеи"
        PREMEDICATION = "PREMEDICATION", "Премедикация"
        INTRODUCTION = "INTRODUCTION", "Вводный наркоз"
        TURN = "TURN", "Поворот"
        DECURARISATION = "DECURARISATION", "Декураризация"
        BLOCKADE = "BLOCKADE", "Блокада"
        OPERATION_START = "OPERATION_START", "Начало операции"
        OPERATION_STOP = "OPERATION_STOP", "Окончание операции"
        INFUSION_START = "INFUSION_START", "Начало инфузии"
        INFUSION_STOP = "INFUSION_STOP", "Окончание инфузии"
        SPONTANEOUS = "SPONTANEOUS", "Самостоятельное дыхание"
        SUPPORTIVE = "SUPPORTIVE", "Вспомогательное дыхание"
        FORCED = "FORCED", "Принудительное дыхание"

    # Действия, которые могут быть в карте только один раз.
    UNIQUE_VALUES = (Value.ANESTHESIA_START, Value.ANESTHESIA_STOP)

    operation = models.ForeignKey("operations.Operation", on_delete=models.CASCADE, related_name="anesthetic_actions")
    time = models.DateTimeField("время")
    value = models.CharField("действие", max_length=32, choices=Value.choices)

    class Meta:
        verbose_name = "анестезиологическое действие"
        verbose_name_plural = "анестезиологические действия"
        ordering = ["time", "id"]


class BreathCharacteristic(models.Model):
    class BreathType(models.TextChoices):
        SPONTANEOUS = "spontaneous", "Самостоятельное"
        SUPPORTIVE = "supportive", "Вспомогательное"
        FORCED = "forced", "Принудительное"

    operation = models.ForeignKey("operations.Operation", on_delete=models.CASCADE,
                                  related_name="breath_characteristics")
    breath_type = models.CharField("тип дыхания", max_length=16, choices=BreathType.choices)
    time_start = models.DateTimeField("начало")
    time_end = models.DateTimeField("окончание")

    class Meta:
        verbose_name = "интервал характеристики дыхания"
        verbose_name_plural = "характеристики дыхания"
        ordering = ["time_start", "id"]


class OperationStage(models.Model):
    """Этапы операции (1 — разрез, 2–5 — этапы, 6 — окончание/ушивание раны)."""

    STAGES_COUNT = 6

    operation = models.ForeignKey("operations.Operation", on_delete=models.CASCADE, related_name="stages")
    stage = models.PositiveSmallIntegerField("этап")
    time_start = models.DateTimeField("время", null=True, blank=True)
    description = models.CharField("описание", max_length=500, blank=True)

    class Meta:
        verbose_name = "этап операции"
        verbose_name_plural = "этапы операции"
        ordering = ["stage"]
        constraints = [models.UniqueConstraint(fields=["operation", "stage"], name="unique_operation_stage")]


class DrugAdministration(models.Model):
    """Введение препарата. Объединяет три таблицы исходной системы (премедикация, вводный наркоз, поддержание)."""

    class Section(models.TextChoices):
        PREMEDICATION = "premedication", "Премедикация"
        INTRODUCTION = "introduction", "Введение в анестезию"
        MAINTENANCE = "maintenance", "Поддержание анестезии"

    class InjectionType(models.TextChoices):
        BOLUS = "BOLUS", "Болюсное"
        INFUSION = "INFUSION", "Инфузионное"

    operation = models.ForeignKey("operations.Operation", on_delete=models.CASCADE, related_name="drugs")
    section = models.CharField("раздел", max_length=16, choices=Section.choices)
    drug = models.CharField("препарат", max_length=255)
    injection_type = models.CharField("способ введения", max_length=16, choices=InjectionType.choices)
    measurement_unit = models.ForeignKey(MeasurementUnit, on_delete=models.PROTECT, verbose_name="ед. измерения")
    dose = models.DecimalField("доза", max_digits=12, decimal_places=4, validators=[MinValueValidator(0)])
    time_start = models.DateTimeField("время введения/начала", null=True, blank=True)
    time_end = models.DateTimeField("окончание", null=True, blank=True)

    class Meta:
        verbose_name = "введение препарата"
        verbose_name_plural = "введение препаратов"
        ordering = ["section", "drug", "time_start", "id"]
        indexes = [models.Index(fields=["operation", "section"])]


class _TimedSolution(models.Model):
    time_start = models.DateTimeField("начало", null=True, blank=True)
    time_end = models.DateTimeField("окончание", null=True, blank=True)

    class Meta:
        abstract = True
        ordering = ["time_start", "id"]


class Infusion(_TimedSolution):
    operation = models.ForeignKey("operations.Operation", on_delete=models.CASCADE, related_name="infusions")
    solution = models.CharField("раствор", max_length=255)
    dose = models.DecimalField("объём, мл", max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta(_TimedSolution.Meta):
        verbose_name = "инфузия"
        verbose_name_plural = "инфузионная терапия"


class Transfusion(_TimedSolution):
    operation = models.ForeignKey("operations.Operation", on_delete=models.CASCADE, related_name="transfusions")
    solution = models.CharField("компонент крови", max_length=255)
    gemakon = models.CharField("гемакон (номер/объём)", max_length=64)

    class Meta(_TimedSolution.Meta):
        verbose_name = "трансфузия"
        verbose_name_plural = "трансфузионная терапия"


class Liquid(_TimedSolution):
    operation = models.ForeignKey("operations.Operation", on_delete=models.CASCADE, related_name="liquids")
    liquid = models.CharField("вид потерь", max_length=255)
    volume = models.DecimalField("объём, мл", max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta(_TimedSolution.Meta):
        verbose_name = "жидкостные потери"
        verbose_name_plural = "жидкостные потери"
