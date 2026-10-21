"""Бизнес-логика операционных случаев (перенос OperationController/OperationPolicy/MedicalStaff)."""
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import SUPERVISOR_ROLES, Role, User
from apps.card.models import AnestheticAction
from apps.common.exceptions import BusinessRuleViolation
from apps.patients.models import Patient

from .models import Operation

# --- права ----------------------------------------------------------------------------------

def ensure_can_edit(actor: User, doctor: User | None) -> None:
    """Создавать/изменять ОС могут руководители, а врач — только назначая себя (или без врача)."""
    if actor.role in SUPERVISOR_ROLES:
        return
    if actor.role == Role.DOCTOR and (doctor is None or doctor.pk == actor.pk):
        return
    raise PermissionDenied("Недостаточно прав для создания/изменения операционного случая.")


def ensure_can_change_state(actor: User, operation: Operation) -> None:
    """Отменить/завершить ОС может руководитель или врач, назначенный на этот ОС."""
    if actor.role in SUPERVISOR_ROLES:
        return
    if actor.role == Role.DOCTOR and operation.doctor_id == actor.pk:
        return
    raise PermissionDenied("Отменить или завершить ОС может только назначенный врач или заведующий.")


def validate_staff(doctor: User | None, nurse: User | None) -> None:
    errors = {}
    if doctor is not None and (doctor.role != Role.DOCTOR or not doctor.is_active):
        errors["doctor"] = ["Пользователь не является активным врачом."]
    if nurse is not None and (nurse.role != Role.NURSE or not nurse.is_active):
        errors["nurse"] = ["Пользователь не является активной медсестрой/медбратом."]
    if errors:
        raise ValidationError(errors)


# --- сценарии -------------------------------------------------------------------------------

@transaction.atomic
def create_operation(actor: User, data: dict) -> Operation:
    patient: Patient = Patient.objects.select_for_update().get(pk=data["patient"].pk)
    ensure_can_edit(actor, data.get("doctor"))
    validate_staff(data.get("doctor"), data.get("nurse"))

    if patient.status == Patient.Status.ACTIVE:
        raise BusinessRuleViolation("Невозможно создать новый операционный случай для пациента со статусом АКТИВНЫЙ.")
    if patient.operations.filter(status__in=Operation.ACTIVE_STATUSES).exists():
        raise BusinessRuleViolation(
            "Невозможно создать новый ОС для пациента, у которого уже есть ОС со статусами ПОСТУПИЛ или НА ОПЕРАЦИИ."
        )

    operation = Operation.objects.create(**{**data, "patient": patient, "status": Operation.Status.ARRIVED})
    patient.status = Patient.Status.ACTIVE
    patient.save(update_fields=["status", "updated_at"])
    return operation


@transaction.atomic
def update_operation(actor: User, operation: Operation, data: dict) -> Operation:
    doctor = data.get("doctor", operation.doctor)
    ensure_can_edit(actor, doctor)
    validate_staff(doctor, data.get("nurse", operation.nurse))
    for field, value in data.items():
        setattr(operation, field, value)
    operation.full_clean(exclude=["patient"])
    operation.save()
    return operation


@transaction.atomic
def cancel_operation(actor: User, operation: Operation, reason: str) -> Operation:
    ensure_can_change_state(actor, operation)
    if operation.has_action(AnestheticAction.Value.ANESTHESIA_START):
        raise BusinessRuleViolation(
            "Операционный случай не может быть отменён после начала анестезии (статус НА ОПЕРАЦИИ или ЗАВЕРШЁН)."
        )
    if operation.status == Operation.Status.CANCELLED:
        raise BusinessRuleViolation("Операционный случай уже отменён.")
    operation.reason_cancel = reason
    operation.status = Operation.Status.CANCELLED
    operation.save(update_fields=["reason_cancel", "status", "updated_at"])
    _archive_patient(operation.patient)
    return operation


@transaction.atomic
def finish_operation(actor: User, operation: Operation) -> Operation:
    ensure_can_change_state(actor, operation)
    if operation.status == Operation.Status.CANCELLED:
        raise BusinessRuleViolation("Отменённый операционный случай нельзя завершить.")
    if not operation.has_action(AnestheticAction.Value.ANESTHESIA_STOP):
        raise BusinessRuleViolation(
            "Операционный случай не может быть переведён в статус ЗАВЕРШЁН, т.к. анестезия не окончена."
        )
    operation.status = Operation.Status.FINISHED
    operation.save(update_fields=["status", "updated_at"])
    _archive_patient(operation.patient)
    return operation


def _archive_patient(patient: Patient) -> None:
    patient.status = Patient.Status.ARCHIVE
    patient.save(update_fields=["status", "updated_at"])


def sync_status_with_actions(operation: Operation) -> None:
    """Пересчёт статусов после изменения анестезиологических действий (перенос AnestheticActionController).

    Для незавершённого и неотменённого ОС: при наличии «Начала анестезии» — НА ОПЕРАЦИИ, иначе — ПОСТУПИЛ;
    карточка пациента становится АКТИВНОЙ.
    """
    if operation.status in (Operation.Status.FINISHED, Operation.Status.CANCELLED):
        return
    started = operation.has_action(AnestheticAction.Value.ANESTHESIA_START)
    operation.status = Operation.Status.ON_OPERATION if started else Operation.Status.ARRIVED
    operation.save(update_fields=["status", "updated_at"])
    if operation.patient.status != Patient.Status.ACTIVE:
        operation.patient.status = Patient.Status.ACTIVE
        operation.patient.save(update_fields=["status", "updated_at"])
