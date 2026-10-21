from django.db import models

from apps.catalogs.models import BloodGroup, BloodRh, Sex
from apps.common.validators import person_name_validator


class Patient(models.Model):
    """Карточка пациента."""

    class Status(models.IntegerChoices):
        NEW = 1, "Новая"
        ACTIVE = 2, "Активная"
        ARCHIVE = 3, "Архивная"

    status = models.PositiveSmallIntegerField("статус карточки", choices=Status.choices, default=Status.NEW)
    surname = models.CharField("фамилия", max_length=150, validators=[person_name_validator])
    firstname = models.CharField("имя", max_length=150, validators=[person_name_validator])
    lastname = models.CharField("отчество", max_length=150, blank=True, validators=[person_name_validator])
    sex = models.ForeignKey(Sex, on_delete=models.PROTECT, verbose_name="пол")
    birthdate = models.DateField("дата рождения")
    blood_group = models.ForeignKey(BloodGroup, on_delete=models.PROTECT, verbose_name="группа крови")
    blood_rh = models.ForeignKey(BloodRh, on_delete=models.PROTECT, verbose_name="резус-фактор")
    snils = models.CharField("СНИЛС", max_length=20, blank=True)
    enp = models.CharField("ЕНП (полис)", max_length=32, blank=True)
    created_at = models.DateTimeField("создана", auto_now_add=True)
    updated_at = models.DateTimeField("изменена", auto_now=True)

    class Meta:
        verbose_name = "пациент"
        verbose_name_plural = "пациенты"
        ordering = ["surname", "firstname"]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["surname"])]
        constraints = [
            models.UniqueConstraint(
                fields=["surname", "firstname", "lastname", "birthdate", "sex"], name="unique_patient_identity",
                violation_error_message="Пациент с такими ФИО, датой рождения и полом уже существует.",
            )
        ]

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return " ".join(part for part in (self.surname, self.firstname, self.lastname) if part)
