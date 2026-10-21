"""Расчёты наркозной карты: итоговые дозы, длительности, данные для печатной формы."""
from collections import OrderedDict
from datetime import datetime
from decimal import Decimal

from apps.operations.models import Operation

from .models import AnestheticAction, DrugAdministration, OperationStage

# Пересчёт массовых единиц в миллиграммы (id единиц из справочника measurement_units).
MASS_TO_MG = {1: Decimal(1), 2: Decimal("0.001"), 4: Decimal("0.000001")}  # mg, mcg, ng


def _format_number(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def summarize_doses(rows) -> list[dict]:
    """Суммарные дозы по препаратам.

    Массовые единицы (mg/mcg/ng) приводятся к mg; прочие (ml, Ед, ME, об.%) суммируются в своей единице.
    В исходной системе ml ошибочно пересчитывались в mg (×1000) — здесь это исправлено.
    """
    totals: "OrderedDict[tuple[str, str], Decimal]" = OrderedDict()
    for row in rows:
        unit_id = row.measurement_unit_id
        if unit_id in MASS_TO_MG:
            key, amount = (row.drug, "mg"), row.dose * MASS_TO_MG[unit_id]
        else:
            key, amount = (row.drug, row.measurement_unit.name), row.dose
        totals[key] = totals.get(key, Decimal(0)) + amount
    return [
        {"drug": drug, "dose": float(total), "unit": unit, "text": f"{drug} {_format_number(total)} {unit}"}
        for (drug, unit), total in totals.items()
    ]


def drugs_for(operation: Operation, *sections: str):
    qs = DrugAdministration.objects.filter(operation=operation).select_related("measurement_unit").order_by("id")
    return qs.filter(section__in=sections) if sections else qs


def minutes_between(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None:
        return None
    return int((end - start).total_seconds() // 60)


def operation_duration_minutes(operation: Operation) -> int | None:
    """Длительность операции: от этапа 1 (разрез) до этапа 6 (окончание, ушивание раны)."""
    times = dict(OperationStage.objects.filter(operation=operation, stage__in=(1, 6)).values_list("stage", "time_start"))
    return minutes_between(times.get(1), times.get(6))


def anesthesia_duration_minutes(operation: Operation) -> int | None:
    return minutes_between(
        operation.action_time(AnestheticAction.Value.ANESTHESIA_START),
        operation.action_time(AnestheticAction.Value.ANESTHESIA_STOP),
    )


def format_hhmm(minutes: int | None) -> str | None:
    if minutes is None:
        return None
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def ensure_stages(operation: Operation) -> None:
    """Как в исходной системе: при первом обращении создаются 6 пустых этапов."""
    existing = set(OperationStage.objects.filter(operation=operation).values_list("stage", flat=True))
    missing = [OperationStage(operation=operation, stage=n)
               for n in range(1, OperationStage.STAGES_COUNT + 1) if n not in existing]
    if missing:
        OperationStage.objects.bulk_create(missing, ignore_conflicts=True)


def _name(obj) -> str | None:
    return obj.name if obj is not None else None


def card_print_data(operation: Operation) -> dict:
    """Данные для бумажной формы наркозной карты (блоки 1, 4, 5 исходной системы)."""
    from apps.monitoring.services import hemodynamics_series, respiratory_series

    patient = operation.patient
    tube = getattr(operation, "tube_mask_installation", None)
    ventilator = getattr(operation, "protocol_ventilator", None)
    today = operation.operation_date
    age = None
    if today and patient.birthdate:
        age = today.year - patient.birthdate.year - ((today.month, today.day) < (patient.birthdate.month, patient.birthdate.day))

    general = {
        "surname": patient.surname,
        "firstname": patient.firstname,
        "lastname": patient.lastname,
        "sex": patient.sex.name,
        "birthdate": patient.birthdate,
        "age": age,
        "blood_group": patient.blood_group.name,
        "blood_rh": patient.blood_rh.name,
        "height": operation.height,
        "weight": operation.weight,
        "bmi": operation.bmi,
        "operation_date": operation.operation_date,
        "operation_time": operation.operation_time,
        "operation_name": operation.operation_name,
        "operation_code": operation.operation_code,
        "diagnosis_name": operation.diagnosis_name,
        "history_number": operation.history_number,
        "drug_intolerance": operation.drug_intolerance,
        "type_operation": operation.type_operation.name,
        "asa": operation.asa.name if operation.asa else None,
        "volume_operation": operation.volume_operation.name if operation.volume_operation else None,
        "department": operation.department.name if operation.department else None,
        "ventilator": _name(operation.ventilator or (ventilator.ventilator if ventilator else None)),
        "monitoring": _name(operation.monitoring or (ventilator.monitoring if ventilator else None)),
        "status": operation.get_status_display(),
        "tube_installed": tube.tube_installed if tube else None,
        "pid": operation.pid,
        "doctor": operation.doctor.full_name if operation.doctor else None,
        "nurse": operation.nurse.full_name if operation.nurse else None,
    }
    return {
        "general": general,
        "premedication": summarize_doses(drugs_for(operation, DrugAdministration.Section.PREMEDICATION)),
        "introduction": summarize_doses(drugs_for(operation, DrugAdministration.Section.INTRODUCTION)),
        "maintenance": summarize_doses(drugs_for(operation, DrugAdministration.Section.MAINTENANCE)),
        "operation_duration_minutes": operation_duration_minutes(operation),
        "anesthesia_duration_minutes": anesthesia_duration_minutes(operation),
        "respiratory": respiratory_series(operation),
        "hemodynamics": hemodynamics_series(operation),
    }
