"""Структура лабораторного мониторинга (перенос полей формы LabMonitoring исходного UI).

Каждый показатель: (код, наименование, единица, тип). Типы:
* ``number``  — неотрицательное число 0…999 (как в исходных валидаторах);
* ``signed``  — число −999…999 (дефицит оснований BE может быть отрицательным);
* ``plus``    — строка из символов «+» (например «++»);
* ``text``    — произвольный короткий текст.
"""
from decimal import Decimal, InvalidOperation

NUMBER, SIGNED, PLUS, TEXT = "number", "signed", "plus", "text"

_GAS = [("pH", "pH", "ед", NUMBER), ("O2", "pO2", "мм рт.ст.", NUMBER), ("CO2", "pCO2", "мм рт.ст.", NUMBER),
        ("BE", "BE", "ммоль/л", SIGNED), ("HCO3", "HCO3", "ммоль/л", NUMBER)]

SECTIONS: list[dict] = [
    {"key": "blood_general", "title": "Общий анализ крови", "fields": [
        ("HGB", "Гемоглобин", "г/л", NUMBER), ("HCT", "Гематокрит", "%", NUMBER),
        ("RBC", "Эритроциты", "×10¹²/л", NUMBER), ("WBC", "Лейкоциты", "×10⁹/л", NUMBER),
        ("PLT", "Тромбоциты", "×10⁹/л", NUMBER), ("NEUT", "Нейтрофилы", "%", NUMBER),
        ("EO", "Эозинофилы", "%", NUMBER), ("BA", "Базофилы", "%", NUMBER),
        ("LYM", "Лимфоциты", "%", NUMBER), ("MON", "Моноциты", "%", NUMBER),
    ]},
    {"key": "blood_biochemical", "title": "Биохимический анализ крови", "fields": [
        ("Na", "Na (натрий)", "ммоль/л", NUMBER), ("K", "K (калий)", "ммоль/л", NUMBER),
        ("Cl", "Cl (хлор)", "ммоль/л", NUMBER), ("Fe", "Fe (железо)", "мкмоль/л", NUMBER),
        ("GLU", "Глюкоза", "ммоль/л", NUMBER), ("OSM", "Осмолярность", "мосм/л", NUMBER),
    ]},
    {"key": "coagulogram", "title": "Показатели коагулограммы", "fields": [
        ("PT", "Протромбиновое время", "сек", NUMBER), ("Quick", "Протромбин (по Квику)", "%", NUMBER),
        ("INR", "МНО", "", NUMBER), ("APTT", "АЧТВ", "сек", NUMBER), ("Fibrinogen", "Фибриноген", "г/л", NUMBER),
        ("TT", "Тромбиновое время", "сек", NUMBER), ("Antithrombin", "Антитромбин III", "%", NUMBER),
        ("Ddimer", "D-димер", "нг/мл", NUMBER), ("Plasminogen", "Плазминоген", "%", NUMBER),
    ]},
    {"key": "gas_arterial", "title": "Газовый состав: артериальная кровь", "fields": _GAS},
    {"key": "gas_venous", "title": "Газовый состав: венозная кровь", "fields": _GAS},
    {"key": "gas_capillary", "title": "Газовый состав: капиллярная кровь", "fields": _GAS},
    {"key": "teg5000", "title": "Тромбоэластограмма: ТЭГ5000", "fields": [
        ("R", "R", "", NUMBER), ("MA", "MA", "", NUMBER), ("AngleA", "Угол α", "", NUMBER),
        ("K", "K", "", NUMBER), ("LY30", "LY30", "", NUMBER),
    ]},
    {"key": "rotem", "title": "Тромбоэластограмма: ROTEM", "fields": [
        ("CT", "CT", "", NUMBER), ("MCF", "MCF", "", NUMBER), ("AngleA", "Угол α", "", NUMBER),
        ("CFT", "CFT", "", NUMBER), ("CL", "CL", "", NUMBER),
    ]},
    {"key": "urine", "title": "Общий анализ мочи (ОАМ)", "fields": [
        ("diuresis", "Суточное количество", "мл", NUMBER), ("density", "SG (удельный вес)", "г/мл", NUMBER),
        ("ph", "pH (реакция)", "ед", NUMBER), ("Na", "Натрий Na+", "ммоль/л", NUMBER),
        ("urea", "Мочевина", "ммоль/л", NUMBER), ("protein", "PRO (белок)", "г/л", NUMBER),
        ("osm", "Осмолярность", "мосм/л", NUMBER), ("K", "Калий K+", "ммоль/л", NUMBER),
        ("creatinine", "Креатинин", "мкмоль/л", NUMBER), ("urobilinogen", "UBG (уробилиноген)", "", PLUS),
        ("ket", "KET (кетоны)", "", PLUS), ("nitritis", "NIT (нитриты)", "", PLUS),
        ("wbc", "LEU (лейкоциты)", "в п/з", NUMBER), ("rbc", "BLD (эритроциты)", "в п/з", NUMBER),
        ("glu", "GLU (глюкоза)", "ммоль/л", NUMBER), ("bilirubin", "BIL (билирубин)", "", NUMBER),
        ("epithelium", "Плоский эпителий", "в п/з", NUMBER), ("cylindres", "Цилиндры", "в п/з", NUMBER),
        ("mucus", "Слизь", "в п/з", NUMBER), ("color", "Цвет", "", TEXT),
    ]},
]

_FIELDS = {section["key"]: {code: kind for code, _label, _unit, kind in section["fields"]} for section in SECTIONS}


def schema_payload() -> list[dict]:
    return [
        {
            "key": section["key"],
            "title": section["title"],
            "fields": [{"code": c, "label": label, "unit": unit, "type": kind} for c, label, unit, kind in section["fields"]],
        }
        for section in SECTIONS
    ]


def clean_values(raw) -> tuple[dict, dict]:
    """Проверяет значения и возвращает (очищенные значения, ошибки). Пустые значения отбрасываются."""
    cleaned: dict = {}
    errors: dict = {}
    if not isinstance(raw, dict):
        return {}, {"values": ["Ожидается объект вида {раздел: {показатель: значение}}."]}

    for section_key, values in raw.items():
        fields = _FIELDS.get(section_key)
        if fields is None:
            errors[section_key] = ["Неизвестный раздел."]
            continue
        if not isinstance(values, dict):
            errors[section_key] = ["Ожидается объект с показателями."]
            continue
        for code, value in values.items():
            kind = fields.get(code)
            path = f"{section_key}.{code}"
            if kind is None:
                errors[path] = ["Неизвестный показатель."]
                continue
            if value is None or (isinstance(value, str) and value.strip() == ""):
                continue
            ok, result = _clean_one(kind, value)
            if ok:
                cleaned.setdefault(section_key, {})[code] = result
            else:
                errors[path] = [result]
    return cleaned, errors


def _clean_one(kind: str, value) -> tuple[bool, object]:
    if kind in (NUMBER, SIGNED):
        try:
            number = Decimal(str(value).strip().replace(",", "."))
        except InvalidOperation:
            return False, "Ожидается число."
        if not number.is_finite():
            return False, "Ожидается число."
        low = Decimal(-999) if kind == SIGNED else Decimal(0)
        if number < low or number > Decimal(999):
            return False, f"Значение должно быть в диапазоне {low}…999."
        return True, float(number)
    text = str(value).strip()
    if kind == PLUS:
        if set(text) != {"+"} or len(text) > 4:
            return False, "Допускаются только символы «+» (не более 4)."
        return True, text
    if len(text) > 64:
        return False, "Не более 64 символов."
    return True, text
