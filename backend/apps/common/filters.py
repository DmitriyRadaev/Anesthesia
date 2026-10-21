from django_filters import rest_framework as filters
from rest_framework.exceptions import ValidationError


class ChoiceListFilter(filters.CharFilter):
    """Фильтр по одному или нескольким значениям: `?status=1&status=2` или `?status=1,2`.

    Пустые значения игнорируются (клиенты часто передают `?role=`), неизвестные значения дают 400.
    """

    def __init__(self, *args, choices, **kwargs):
        self.allowed = {str(value) for value, _label in choices}
        super().__init__(*args, **kwargs)

    def filter(self, qs, value):
        raw = self.parent.data.getlist(self.field_name) if hasattr(self.parent.data, "getlist") else [value]
        values = [part.strip() for item in raw if item for part in str(item).split(",") if part.strip()]
        if not values:
            return qs
        unknown = [v for v in values if v not in self.allowed]
        if unknown:
            raise ValidationError({self.field_name: [f"Недопустимые значения: {', '.join(unknown)}."]})
        return qs.filter(**{f"{self.field_name}__in": values})
