from django.core.validators import RegexValidator

# Аналог правила Laravel `regex:/^[Ёёa-zA-ZА-Яа-я\s-]+$/ui` для ФИО.
person_name_validator = RegexValidator(
    regex=r"^[ЁёA-Za-zА-Яа-я\s-]+$",
    message="Допустимы только буквы (А-Я, A-Z), пробел и дефис.",
)
