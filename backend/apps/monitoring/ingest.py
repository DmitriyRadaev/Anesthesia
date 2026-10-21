from .hl7 import parse_message
from .models import HL7Result


def store_message(message: str) -> HL7Result:
    """Разбирает HL7-сообщение и сохраняет результат (повторное сообщение с тем же ключом перезаписывается)."""
    data = parse_message(message).as_model_kwargs()
    key = {k: data.pop(k) for k in ("observation_at", "pid", "order_number")}
    result, _ = HL7Result.objects.update_or_create(**key, defaults=data)
    return result
