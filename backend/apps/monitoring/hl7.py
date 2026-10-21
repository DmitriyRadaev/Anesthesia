"""Разбор HL7 v2 (ORU^R01) сообщений от шлюза мониторов Mindray eGateway (перенос Services/HL7/Parser).

Используемые сегменты:
* PID-3.1 — идентификатор пациента (PID);
* PV1-3 — отделение^палата^койка^...^устройство (компонент 9);
* OBR-2.1 — номер заказа, OBR-7.1 — время измерения (YYYYMMDDHHMMSS[.ffff]);
* OBX-3.1/3.2 — номер и код показателя (MDC_*), OBX-5.1 — значение, OBX-6.2 — единица.
"""
from dataclasses import dataclass, field
from datetime import datetime

from django.utils import timezone

FIELD_SEP, COMPONENT_SEP = "|", "^"
MLLP_START, MLLP_END = "\x0b", "\x1c"


class HL7ParseError(ValueError):
    pass


def _component(fields: list[str], index: int, component: int) -> str:
    if index >= len(fields):
        return ""
    parts = fields[index].split(COMPONENT_SEP)
    return parts[component] if component < len(parts) else ""


def parse_hl7_timestamp(value: str) -> datetime:
    digits = value.split(".")[0].split("+")[0].split("-")[0]
    if len(digits) < 12:
        raise HL7ParseError(f"Некорректное время HL7: {value!r}")
    fmt = "%Y%m%d%H%M%S" if len(digits) >= 14 else "%Y%m%d%H%M"
    naive = datetime.strptime(digits[: 14 if len(digits) >= 14 else 12], fmt)
    return timezone.make_aware(naive)


@dataclass
class ParsedResult:
    pid: str = ""
    department: str = ""
    room: str = ""
    bed: str = ""
    device: str = ""
    order_number: str = ""
    observation_at: datetime | None = None
    observations: list[dict] = field(default_factory=list)

    def as_model_kwargs(self) -> dict:
        if not self.pid or self.observation_at is None:
            raise HL7ParseError("В сообщении нет PID или времени измерения (OBR-7).")
        return {
            "pid": self.pid, "department": self.department, "room": self.room, "bed": self.bed,
            "device": self.device, "order_number": self.order_number or "", "observation_at": self.observation_at,
            "observations": self.observations,
        }


def parse_message(message: str) -> ParsedResult:
    """Разбирает одно HL7-сообщение (сегменты разделены CR и/или LF)."""
    result = ParsedResult()
    cleaned = message.replace(MLLP_START, "").replace(MLLP_END, "")
    for raw in cleaned.replace("\r\n", "\r").replace("\n", "\r").split("\r"):
        segment = raw.strip()
        if not segment:
            continue
        fields = segment.split(FIELD_SEP)
        kind = fields[0]
        if kind == "PID":
            result.pid = _component(fields, 3, 0)
        elif kind == "PV1":
            result.department = _component(fields, 3, 0)
            result.room = _component(fields, 3, 1)
            result.bed = _component(fields, 3, 2)
            result.device = _component(fields, 3, 8)
        elif kind == "OBR":
            result.order_number = _component(fields, 2, 0)
            stamp = _component(fields, 7, 0)
            if stamp:
                result.observation_at = parse_hl7_timestamp(stamp)
        elif kind == "OBX":
            result.observations.append({
                "observation_number": _component(fields, 3, 0),
                "observation_name": _component(fields, 3, 1),
                "observation_value": _component(fields, 5, 0),
                "unit": _component(fields, 6, 1),
            })
    return result


class MLLPBuffer:
    """Накопитель потока байтов TCP: выдаёт целые сообщения, обрамлённые MLLP (0x0B ... 0x1C 0x0D)."""

    def __init__(self):
        self._buffer = ""

    def feed(self, chunk: str) -> list[str]:
        self._buffer += chunk
        messages = []
        while MLLP_END in self._buffer:
            message, self._buffer = self._buffer.split(MLLP_END, 1)
            self._buffer = self._buffer.lstrip("\r\n")
            start = message.find(MLLP_START)
            messages.append(message[start + 1:] if start >= 0 else message)
        return messages
