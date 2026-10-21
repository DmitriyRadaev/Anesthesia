"""Бизнес-логика карточек пациентов (перенос PatientController)."""
from django.db import transaction
from django.db.models import Exists, F, OuterRef, Prefetch, Q, QuerySet, Subquery

from apps.common.exceptions import BusinessRuleViolation
from apps.operations.models import Operation

from .models import Patient


def archive_patient(patient: Patient) -> Patient:
    if patient.operations.filter(status__in=Operation.ACTIVE_STATUSES).exists():
        raise BusinessRuleViolation(
            "Нельзя перевести карточку пациента в архив, т.к. у него имеются ОС со статусами ПОСТУПИЛ или НА ОПЕРАЦИИ."
        )
    patient.status = Patient.Status.ARCHIVE
    patient.save(update_fields=["status", "updated_at"])
    return patient


def unarchive_patient(patient: Patient) -> Patient:
    patient.status = Patient.Status.ACTIVE
    patient.save(update_fields=["status", "updated_at"])
    return patient


@transaction.atomic
def delete_patient(patient: Patient) -> None:
    if patient.operations.exists():
        raise BusinessRuleViolation("Нельзя удалить пациента, у которого есть операционные случаи.")
    patient.delete()


def registry_queryset() -> QuerySet[Patient]:
    """Реестр пациентов с сортировкой исходной системы.

    Для каждого пациента берётся «представительный» ОС (минимальный статус, затем самая поздняя дата/время),
    реестр сортируется по статусу карточки, статусу этого ОС и убыванию даты/времени операции.
    """
    representative = Operation.objects.filter(patient=OuterRef("pk")).order_by(
        "status", F("operation_date").desc(nulls_first=True), F("operation_time").desc(nulls_first=True)
    )
    operations = Operation.objects.select_related("doctor", "nurse", "type_operation").order_by(
        "status", F("operation_date").desc(nulls_first=True), F("operation_time").desc(nulls_first=True), "-id"
    )
    return (
        Patient.objects.select_related("sex", "blood_group", "blood_rh")
        .annotate(
            rep_status=Subquery(representative.values("status")[:1]),
            rep_date=Subquery(representative.values("operation_date")[:1]),
            rep_time=Subquery(representative.values("operation_time")[:1]),
        )
        .prefetch_related(Prefetch("operations", queryset=operations))
        .order_by(
            "status",
            F("rep_status").asc(nulls_last=True),
            F("rep_date").desc(nulls_first=True),
            F("rep_time").desc(nulls_first=True),
            "-id",
        )
    )


def filter_by_staff(qs: QuerySet[Patient], user) -> QuerySet[Patient]:
    """Пациенты, в ОС которых пользователь назначен врачом или медсестрой («Мои пациенты»)."""
    mine = Operation.objects.filter(patient=OuterRef("pk")).filter(Q(doctor=user) | Q(nurse=user))
    return qs.filter(Exists(mine))
