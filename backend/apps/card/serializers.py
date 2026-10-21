from datetime import datetime, timedelta
from decimal import Decimal

from rest_framework import serializers

from apps.catalogs.models import MeasurementUnit
from apps.operations.models import Operation

from .models import (
    AnestheticAction,
    DrugAdministration,
    OperationStage,
)


class LocalizedDecimalField(serializers.DecimalField):
    """Число с десятичной запятой или точкой ("0,5" и "0.5")."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = data.strip().replace(",", ".")
        return super().to_internal_value(data)


def format_decimal(value) -> str:
    """Десятичное число без экспоненты и лишних нулей: Decimal("100.0000") → "100"."""
    if not isinstance(value, Decimal):
        return str(value)
    text = format(value, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _minute(value: datetime) -> datetime:
    return value.replace(second=0, microsecond=0)


def _is_ongoing_infusion(item: dict) -> bool:
    return item.get("injection_type") == DrugAdministration.InjectionType.INFUSION


def check_overlaps(items: list[dict], *, open_end_is_infinite=lambda item: False) -> bool:
    """Интервалы одной группы не должны пересекаться (с точностью до минуты, границы включительно).

    Интервал без окончания — точка (болюс), либо бесконечный (продолжающаяся инфузия).
    """
    spans = []
    for item in items:
        start = item.get("time_start")
        if start is None:
            continue
        end = item.get("time_end")
        if end is None:
            end = start + timedelta(days=3650) if open_end_is_infinite(item) else start
        spans.append((_minute(start), _minute(end)))
    spans.sort()
    return all(nxt[0] > prev[1] for prev, nxt in zip(spans, spans[1:]))


class TimeRangeMixin:
    def validate(self, attrs):
        start, end = attrs.get("time_start"), attrs.get("time_end")
        if start and end and end < start:
            raise serializers.ValidationError({"time_end": ["Время окончания раньше времени начала."]})
        return attrs


# --- информация о пациенте в карте --------------------------------------------------------------

class CardPatientInfoSerializer(serializers.ModelSerializer):
    surname = serializers.CharField(source="patient.surname", read_only=True)
    firstname = serializers.CharField(source="patient.firstname", read_only=True)
    lastname = serializers.CharField(source="patient.lastname", read_only=True)
    birthdate = serializers.DateField(source="patient.birthdate", read_only=True)
    sex = serializers.IntegerField(source="patient.sex_id", read_only=True)
    blood_group = serializers.IntegerField(source="patient.blood_group_id", read_only=True)
    blood_rh = serializers.IntegerField(source="patient.blood_rh_id", read_only=True)
    bmi = serializers.FloatField(read_only=True)

    class Meta:
        model = Operation
        fields = [
            "id", "surname", "firstname", "lastname", "birthdate", "sex", "blood_group", "blood_rh",
            "status", "operation_date", "operation_time", "pid", "operation_code",
            "asa", "volume_operation", "department", "drug_intolerance", "type_operation", "ventilator",
            "monitoring", "operation_name", "diagnosis_name", "height", "weight", "bmi",
        ]
        read_only_fields = ["id", "status", "operation_date", "operation_time", "pid", "operation_code"]

    def validate_department(self, department):
        if department is not None and department.department_type_id != 1:
            raise serializers.ValidationError("Выберите отделение типа «Операционное отделение».")
        return department


class PidDateTimeSerializer(serializers.ModelSerializer):
    # null допускается: «Очистить все» в наркозной карте сбрасывает дату и время поступления
    operation_date = serializers.DateField(allow_null=True)
    operation_time = serializers.TimeField(allow_null=True)

    class Meta:
        model = Operation
        fields = ["operation_date", "operation_time", "pid"]


# --- анестезиологические действия -----------------------------------------------------------------

class AnestheticActionSerializer(serializers.ModelSerializer):
    value_display = serializers.CharField(source="get_value_display", read_only=True)

    class Meta:
        model = AnestheticAction
        fields = ["id", "time", "value", "value_display"]
        read_only_fields = ["id"]


def validate_actions(items: list[dict]) -> None:
    errors = []
    for unique in AnestheticAction.UNIQUE_VALUES:
        if sum(1 for item in items if item["value"] == unique) > 1:
            errors.append(f"Действие «{AnestheticAction.Value(unique).label}» может быть указано только один раз.")
    start = next((i["time"] for i in items if i["value"] == AnestheticAction.Value.ANESTHESIA_START), None)
    stop = next((i["time"] for i in items if i["value"] == AnestheticAction.Value.ANESTHESIA_STOP), None)
    if stop is not None and start is None:
        errors.append("«Окончание анестезии» нельзя указать без «Начала анестезии».")
    if start and stop and stop <= start:
        errors.append("«Окончание анестезии» должно быть позже «Начала анестезии».")
    if errors:
        raise serializers.ValidationError({"non_field_errors": errors})


# --- характеристики дыхания ------------------------------------------------------------------------

class BreathIntervalSerializer(serializers.Serializer):
    time_start = serializers.DateTimeField()
    time_end = serializers.DateTimeField()

    def validate(self, attrs):
        if attrs["time_end"] <= attrs["time_start"]:
            raise serializers.ValidationError({"time_end": ["Время окончания должно быть позже начала."]})
        return attrs


class BreathCharacteristicsSerializer(serializers.Serializer):
    spontaneous = BreathIntervalSerializer(many=True, required=False, default=list)
    supportive = BreathIntervalSerializer(many=True, required=False, default=list)
    forced = BreathIntervalSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        for breath_type, items in attrs.items():
            if not check_overlaps(items):
                raise serializers.ValidationError({breath_type: ["Интервалы пересекаются."]})
        return attrs


# --- этапы операции ----------------------------------------------------------------------------------

class OperationStageSerializer(serializers.ModelSerializer):
    stage = serializers.IntegerField(min_value=1, max_value=OperationStage.STAGES_COUNT)

    class Meta:
        model = OperationStage
        fields = ["stage", "time_start", "description"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}


# --- препараты / растворы / потери (сгруппированные наборы) --------------------------------------------

class DrugItemSerializer(TimeRangeMixin, serializers.Serializer):
    injection_type = serializers.ChoiceField(choices=DrugAdministration.InjectionType.choices)
    measurement_unit = serializers.PrimaryKeyRelatedField(queryset=MeasurementUnit.objects.all())
    dose = LocalizedDecimalField(max_digits=12, decimal_places=4, min_value=Decimal("0.0001"))
    time_start = serializers.DateTimeField()
    time_end = serializers.DateTimeField(allow_null=True, required=False, default=None,
                                         help_text="Для инфузии без окончания — продолжается")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs["injection_type"] == DrugAdministration.InjectionType.BOLUS:
            attrs["time_end"] = None
        return attrs

    def to_representation(self, instance):
        return {
            "injection_type": instance.injection_type,
            "measurement_unit": instance.measurement_unit_id,
            "dose": format_decimal(instance.dose),
            "time_start": serializers.DateTimeField().to_representation(instance.time_start) if instance.time_start else None,
            "time_end": serializers.DateTimeField().to_representation(instance.time_end) if instance.time_end else None,
        }


class _GroupMixin:
    group_field = ""

    @staticmethod
    def open_end_is_infinite(item: dict) -> bool:
        return False

    def validate(self, attrs):
        if not check_overlaps(attrs["items"], open_end_is_infinite=self.open_end_is_infinite):
            raise serializers.ValidationError({"items": [f"Интервалы для «{attrs[self.group_field]}» пересекаются."]})
        return attrs


class DrugGroupSerializer(_GroupMixin, serializers.Serializer):
    group_field = "drug"
    open_end_is_infinite = staticmethod(_is_ongoing_infusion)
    drug = serializers.CharField(max_length=255)
    items = DrugItemSerializer(many=True, allow_empty=False)


class InfusionItemSerializer(TimeRangeMixin, serializers.Serializer):
    dose = LocalizedDecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"), help_text="Объём, мл")
    time_start = serializers.DateTimeField()
    time_end = serializers.DateTimeField(allow_null=True, required=False, default=None)


class InfusionGroupSerializer(_GroupMixin, serializers.Serializer):
    group_field = "solution"
    solution = serializers.CharField(max_length=255)
    items = InfusionItemSerializer(many=True, allow_empty=False)


class TransfusionItemSerializer(TimeRangeMixin, serializers.Serializer):
    gemakon = serializers.CharField(max_length=64, help_text="Номер/объём гемакона")
    time_start = serializers.DateTimeField()
    time_end = serializers.DateTimeField(allow_null=True, required=False, default=None)


class TransfusionGroupSerializer(_GroupMixin, serializers.Serializer):
    group_field = "solution"
    solution = serializers.CharField(max_length=255)
    items = TransfusionItemSerializer(many=True, allow_empty=False)


class LiquidItemSerializer(TimeRangeMixin, serializers.Serializer):
    volume = LocalizedDecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"), help_text="Объём, мл")
    time_start = serializers.DateTimeField()
    time_end = serializers.DateTimeField(allow_null=True, required=False, default=None)


class LiquidGroupSerializer(_GroupMixin, serializers.Serializer):
    group_field = "liquid"
    liquid = serializers.CharField(max_length=255)
    items = LiquidItemSerializer(many=True, allow_empty=False)


# --- итоги и печать ------------------------------------------------------------------------------------

class DoseTotalSerializer(serializers.Serializer):
    drug = serializers.CharField()
    dose = serializers.FloatField()
    unit = serializers.CharField()
    text = serializers.CharField()
