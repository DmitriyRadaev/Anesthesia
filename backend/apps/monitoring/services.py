"""Выборка и агрегация показателей мониторов (перенос Entities/HL7/CMS.php, CDSS, PDF-блоков 4/5)."""
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

from apps.card.models import AnestheticAction
from apps.operations.models import Operation

from .models import HL7Result

STEP = timedelta(minutes=5)
MAX_WINDOW = timedelta(hours=24)

# Простые показатели: ключ ответа → код(ы) MDC (берётся первый найденный в сообщении).
SCALARS: dict[str, tuple[str, ...]] = {
    "TEMP": ("MDC_TEMP",),
    "BIS": ("MDC_EEG_BISPECTRAL_INDEX",),
    "O2": ("MDC_CONC_AWAY_O2_INSP",),
    "SpO2": ("MDC_PULS_OXIM_SAT_O2",),
    "CO2": ("MDC_CONC_AWAY_CO2_INSP",),
    "N2O": ("MDC_CONC_AWAY_N2O_INSP",),
    "RESP_RATE": ("MDC_CO2_RESP_RATE", "MDC_TTHOR_RESP_RATE"),
    "HEART_RATE": ("MDC_ECG_HEART_RATE",),
    "PULS": ("MDC_PULS_OXIM_PULS_RATE",),
    "SEVOFL": ("MDC_CONC_AWAY_SEVOFL_INSP",),
    "DESFL": ("MDC_CONC_AWAY_DESFL_INSP",),
    "ISOFL": ("MDC_CONC_AWAY_ISOFL_INSP",),
}

# Давления: ключ ответа → префикс MDC (суффиксы _SYS/_MEAN/_DIA).
PRESSURES: dict[str, str] = {
    "PRESS_BLD_VEN_CENT": "MDC_PRESS_BLD_VEN_CENT",
    "PRESS_BLD": "MDC_PRESS_BLD",
    "PRESS_BLD_ART": "MDC_PRESS_BLD_ART",
    "PRESS_BLD_ART_ABP": "MDC_PRESS_BLD_ART_ABP",
    "PRESS_BLD_NONINV": "MDC_PRESS_BLD_NONINV",
    "PRESS_BLD_ART_FEMORAL": "MDC_PRESS_BLD_ART_FEMORAL",
    "PRESS_BLD_ART_BRACHIAL": "MDC_PRESS_BLD_ART_BRACHIAL",
}

# Порядок поиска типа АД для печатной формы (блок 5 наркозной карты).
BLOOD_PRESSURE_TYPES: list[tuple[str, str]] = [
    ("MDC_PRESS_BLD_ART_ABP", "Инвазивное артериальное давление"),
    ("MDC_PRESS_BLD_ART", "Инвазивное артериальное давление"),
    ("MDC_PRESS_BLD", "Инвазивное артериальное давление"),
    ("MDC_PRESS_BLD_NONINV", "Неинвазивное артериальное давление"),
    ("MDC_PRESS_BLD_ART_FEMORAL", "Бедренное артериальное давление"),
    ("MDC_PRESS_BLD_ART_BRACHIAL", "Плечевое артериальное давление"),
]


def _ordered_values(observations: list[dict]) -> list[tuple[str, str]]:
    return [(item.get("observation_name"), item.get("observation_value")) for item in observations or []]


def extract_cms(observations: list[dict] | None) -> dict:
    """Набор показателей ЦМС для одного сообщения (None — нет данных)."""
    result: dict = {key: None for key in SCALARS} | {key: None for key in PRESSURES} | {"AIR": None}
    if not observations:
        return result
    pairs = _ordered_values(observations)
    values = dict(reversed(pairs))  # при дублях берётся первое вхождение
    for key, codes in SCALARS.items():
        for name, value in pairs:
            if name in codes:
                result[key] = value
                break
    o2 = values.get("MDC_CONC_AWAY_O2_INSP")
    if o2 not in (None, ""):
        try:
            result["AIR"] = str(round(100 - float(o2), 2))
        except ValueError:
            pass
    for key, prefix in PRESSURES.items():
        triple = {part: values.get(f"{prefix}_{part}") for part in ("SYS", "MEAN", "DIA")}
        if any(v is not None for v in triple.values()):
            result[key] = triple
    return result


@dataclass
class Window:
    pid: str
    start: datetime
    end: datetime


def operation_window(operation: Operation) -> Window | None:
    """Окно наблюдения: от (поступление − 5 мин) до окончания анестезии или текущего момента (не более 24 ч)."""
    arrival = operation.arrival_datetime
    if arrival is None:
        return None
    end = operation.action_time(AnestheticAction.Value.ANESTHESIA_STOP) or timezone.now()
    start = arrival - STEP
    end = min(end, start + MAX_WINDOW)
    return Window(pid=operation.pid, start=start, end=end)


def results_between(pid: str, start: datetime, end: datetime) -> list[HL7Result]:
    if not pid:
        return []
    return list(HL7Result.objects.filter(pid=pid, observation_at__range=(start, end)).order_by("observation_at"))


def bucketize(rows: list[HL7Result], start: datetime, end: datetime, predicate=None) -> list[tuple[datetime, HL7Result | None]]:
    """Разбивает окно на интервалы по 5 минут; для каждого берётся последнее сообщение (как в исходной системе).

    Ключ интервала — его правая граница. `predicate(row)` позволяет учитывать только подходящие сообщения.
    """
    buckets = []
    rows = [r for r in rows if predicate is None or predicate(r)]
    index = 0
    cursor = start
    while cursor + STEP - timedelta(seconds=1) <= end:
        bucket_end = cursor + STEP
        latest = None
        while index < len(rows) and rows[index].observation_at < bucket_end:
            if rows[index].observation_at >= cursor:
                latest = rows[index]
            index += 1
        buckets.append((bucket_end, latest))
        cursor = bucket_end
    return buckets


def cms_series(operation: Operation) -> dict:
    window = operation_window(operation)
    if window is None:
        return {"time_start": None, "time_end": None, "pid": operation.pid, "data": {}}
    rows = results_between(window.pid, window.start, window.end)
    data = {}
    if rows:
        for bucket_end, row in bucketize(rows, window.start, window.end):
            data[timezone.localtime(bucket_end).isoformat()] = extract_cms(row.observations if row else None)
    return {"time_start": window.start, "time_end": window.end, "pid": window.pid, "data": data}


def _has(row: HL7Result, codes) -> bool:
    names = {item.get("observation_name") for item in row.observations or []}
    return any(code in names for code in codes)


def respiratory_series(operation: Operation) -> dict:
    """Блок 4 печатной формы: ЧДД по капнографии или импедансу."""
    window = operation_window(operation)
    if window is None:
        return {"time_start": None, "time_end": None, "type": None, "data": {}}
    codes = ("MDC_CO2_RESP_RATE", "MDC_TTHOR_RESP_RATE")
    rows = results_between(window.pid, window.start, window.end)
    rr_type = None
    data = {}
    if any(_has(r, codes) for r in rows):
        for bucket_end, row in bucketize(rows, window.start, window.end, lambda r: _has(r, codes)):
            value = " - "
            if row is not None:
                values = row.values()
                if "MDC_CO2_RESP_RATE" in values:
                    value, rr_type = values["MDC_CO2_RESP_RATE"], "Частота дыхания по измерению углекислого газа"
                elif "MDC_TTHOR_RESP_RATE" in values:
                    value, rr_type = values["MDC_TTHOR_RESP_RATE"], "Частота дыхания по импедансу (трансторакально)"
            data[timezone.localtime(bucket_end).isoformat()] = {"RESP_RATE": value}
    return {"time_start": window.start, "time_end": window.end, "type": rr_type, "data": data}


def hemodynamics_series(operation: Operation) -> dict:
    """Блок 5 печатной формы: АД (первый найденный тип) и пульс по пульсоксиметрии."""
    window = operation_window(operation)
    empty = {"time_start": None, "time_end": None, "blood_pressure_type": None, "pulse_type": None, "data": {}}
    if window is None:
        return empty
    rows = results_between(window.pid, window.start, window.end)
    bp_prefix, bp_type = None, None
    for prefix, title in BLOOD_PRESSURE_TYPES:
        if any(_has(r, (f"{prefix}_SYS",)) for r in rows):
            bp_prefix, bp_type = prefix, title
            break
    pulse_code = "MDC_PULS_OXIM_PULS_RATE"
    has_pulse = any(_has(r, (pulse_code,)) for r in rows)
    if bp_prefix is None and not has_pulse:
        return empty | {"time_start": window.start, "time_end": window.end}

    bp_buckets = dict(bucketize(rows, window.start, window.end, lambda r: bp_prefix and _has(r, (f"{bp_prefix}_SYS",))))
    pulse_buckets = dict(bucketize(rows, window.start, window.end, lambda r: _has(r, (pulse_code,))))
    data = {}
    for bucket_end in bp_buckets:
        bp_row, pulse_row = bp_buckets[bucket_end], pulse_buckets.get(bucket_end)
        bp = bp_row.values() if bp_row else {}
        data[timezone.localtime(bucket_end).isoformat()] = {
            "SYS": bp.get(f"{bp_prefix}_SYS"),
            "DIA": bp.get(f"{bp_prefix}_DIA"),
            "MEAN": bp.get(f"{bp_prefix}_MEAN"),
            "PULS": pulse_row.values().get(pulse_code) if pulse_row else None,
        }
    return {
        "time_start": window.start,
        "time_end": window.end,
        "blood_pressure_type": bp_type,
        "pulse_type": "Частота сердечных сокращений по пульсоксиметрии" if has_pulse else None,
        "data": data,
    }


def latest_vitals(operation: Operation, at: datetime | None = None) -> dict:
    """Последние показатели пациента для СППВР (перенос CDSS/AnesthesiaController)."""
    at = at or timezone.now()
    result: dict = {"observation_at": at}
    if not operation.pid:
        return result
    base = HL7Result.objects.filter(pid=operation.pid, observation_at__lte=at).order_by("-observation_at")

    def latest_with(code: str):
        return base.filter(observations__contains=[{"observation_name": code}]).first()

    row = latest_with("MDC_ECG_HEART_RATE")
    if row:
        values = row.values()
        mapping = {"ЧСС": "MDC_ECG_HEART_RATE", "Пульс": "MDC_PULS_OXIM_PULS_RATE", "SpO2": "MDC_PULS_OXIM_SAT_O2"}
        for key, code in mapping.items():
            if code in values:
                result[key] = values[code]
        for code in ("MDC_TTHOR_RESP_RATE", "MDC_CO2_RESP_RATE"):
            if code in values:
                result["ЧДД"] = values[code]
    for prefix, kind in (("MDC_PRESS_BLD_ART_ABP", "INV"), ("MDC_PRESS_BLD_NONINV", "NONINV")):
        row = latest_with(f"{prefix}_SYS")
        if row:
            values = row.values()
            result["АД"] = {"type": kind} | {
                part: values[f"{prefix}_{part}"] for part in ("SYS", "MEAN", "DIA") if f"{prefix}_{part}" in values
            }
    return result
