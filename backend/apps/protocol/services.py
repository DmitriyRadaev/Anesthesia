"""Формирование данных печатной формы протокола анестезии (перенос Protocol/PDFController)."""
from django.utils import timezone

from apps.card.models import DrugAdministration
from apps.card.services import (
    anesthesia_duration_minutes,
    drugs_for,
    operation_duration_minutes,
    summarize_doses,
)
from apps.catalogs.models import AnesthesiaMethod
from apps.operations.models import Operation

PATIENT_ARRIVED_TEXT = (
    "Пациент доставлен в операционную. Начат мониторинг основных витальных функций "
    "(АД, ЧСС, SpO2, внешнее дыхание, ЭКГ). Обеспечен венозный доступ"
)

REGIONAL_REQUIRED = {"Проводниковая", "Плексусная", "Каудальная", "Спинальная (субарахноидальная)", "Эпидуральная"}
REGIONAL_EXCLUDED = {"Аппликационная", "Инфильтрационная"}


def describe_anesthesia(general: list[str], local: list[str]) -> str:
    """Текстовое описание вида и метода анестезии (правила исходной системы)."""
    conclusion = ""
    if len(general) > 1 and not local:
        conclusion = "Выбрана комбинированная анестезия"
    if local and general:
        conclusion = "Выбрана сочетанная анестезия"
    if len(local) > 1 and not general:
        conclusion = "Выбрана комбинированная анестезия"
        if REGIONAL_REQUIRED <= set(local) and not (REGIONAL_EXCLUDED & set(local)):
            conclusion = "Выбрана регионарная анестезия"
    parts = []
    if local:
        parts.append("Местная: " + ", ".join(local))
    if general:
        parts.append("Общая: " + ", ".join(general))
    return (f"{conclusion}. " if conclusion else "") + "; ".join(parts)


def _yes_no(value) -> str | None:
    return None if value is None else ("Да" if value else "Нет")


def _state_line(prefix: str, transferred) -> str:
    def v(name):
        value = getattr(transferred, f"{prefix}_{name}")
        return "" if value is None else value

    time = getattr(transferred, f"{prefix}_time")
    return (
        f"Время: {time.strftime('%H:%M') if time else ''}, АДн: {v('ad')} мм рт.ст., Ps: {v('ps')} в мин, "
        f"SpO2: {v('spo2')} %, ЧД: {v('breath_rate')} в мин, ЦВД: {v('cvp')} см вод.ст."
    )


def protocol_print_data(operation: Operation) -> dict:
    info = getattr(operation, "information_anesthesia", None)
    methods = list(info.anesthesia_methods.order_by("id")) if info else []
    general = [mtd.name for mtd in methods if mtd.type == AnesthesiaMethod.Kind.GENERAL]
    local = [mtd.name for mtd in methods if mtd.type == AnesthesiaMethod.Kind.LOCAL]

    transferred = getattr(operation, "patient_transferred", None)
    redirect = getattr(operation, "redirecting_patient", None)
    ventilator = getattr(operation, "protocol_ventilator", None)
    patient = operation.patient

    def when_transferred(flag: str, value: str):
        if transferred is None:
            return None
        return getattr(transferred, value) if getattr(transferred, flag) else "-"

    transfer_target = None
    if redirect is not None:
        department = redirect.department.name if redirect.department else ""
        transfer_target = f"{redirect.doctor_fio or ' - '}, {department}"

    sections = DrugAdministration.Section
    return {
        "patient_fio": patient.full_name,
        "patient_birthdate": patient.birthdate,
        "anesthesia_types": describe_anesthesia(general, local),
        "operation_date": operation.operation_date,
        "operation_time": operation.operation_time,
        "patient_arrived": (f"{PATIENT_ARRIVED_TEXT} - {_yes_no(info.patient_arrived)}"
                            if info and info.patient_arrived is not None else None),
        "premedication": summarize_doses(drugs_for(operation, sections.PREMEDICATION)),
        "introduction": summarize_doses(drugs_for(operation, sections.INTRODUCTION)),
        "maintenance": summarize_doses(drugs_for(operation, sections.MAINTENANCE)),
        "drugs_total": summarize_doses(drugs_for(operation)),
        "is_decurarisation": _yes_no(transferred.is_decurarisation) if transferred else None,
        "atropine": transferred.atropine if transferred else None,
        "proserine": transferred.proserine if transferred else None,
        "sugammadex": transferred.sugammadex if transferred else None,
        "effective_breathing": when_transferred("is_effective_breathing", "effective_breathing"),
        "regaining_consciousness": when_transferred("is_regaining_consciousness", "regaining_consciousness"),
        "extubation": when_transferred("is_extubation", "extubation"),
        "is_extended_ventilation": _yes_no(transferred.is_extended_ventilation) if transferred else None,
        "operation_duration_minutes": operation_duration_minutes(operation),
        "anesthesia_duration_minutes": anesthesia_duration_minutes(operation),
        "transferred_to": transfer_target,
        "at_start_transportation": _state_line("b", transferred) if transferred else None,
        "at_moment_transfer": _state_line("t", transferred) if transferred else None,
        "note": ventilator.note if ventilator else None,
        "doctor": operation.doctor.full_name if operation.doctor else None,
        "nurse": operation.nurse.full_name if operation.nurse else None,
        "generated_at": timezone.now(),
    }
