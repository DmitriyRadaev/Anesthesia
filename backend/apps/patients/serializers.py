from django.core.validators import RegexValidator
from django.utils import timezone
from rest_framework import serializers

from apps.operations.models import Operation

from .models import Patient


class OperationBriefSerializer(serializers.ModelSerializer):
    """ОС в составе карточки пациента / реестра."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    type_operation_name = serializers.CharField(source="type_operation.name", read_only=True)
    doctor_name = serializers.CharField(source="doctor.full_name", read_only=True, default=None)
    nurse_name = serializers.CharField(source="nurse.full_name", read_only=True, default=None)

    class Meta:
        model = Operation
        fields = [
            "id", "status", "status_display", "operation_date", "operation_time", "type_operation",
            "type_operation_name", "operation_name", "diagnosis_name", "pid", "reason_cancel",
            "doctor", "doctor_name", "nurse", "nurse_name",
        ]
        read_only_fields = fields


class PatientSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    sex_name = serializers.CharField(source="sex.name", read_only=True)
    blood_group_name = serializers.CharField(source="blood_group.name", read_only=True)
    blood_rh_name = serializers.CharField(source="blood_rh.name", read_only=True)
    height = serializers.SerializerMethodField(help_text="Рост из последнего ОС")
    weight = serializers.SerializerMethodField(help_text="Вес из последнего ОС")
    operations = OperationBriefSerializer(many=True, read_only=True)
    snils = serializers.CharField(required=False, allow_blank=True, max_length=20,
                                  validators=[RegexValidator(r"^[0-9\s-]*$", "СНИЛС: допустимы цифры, пробел и дефис.")])
    enp = serializers.CharField(required=False, allow_blank=True, max_length=32,
                                validators=[RegexValidator(r"^[0-9A-Za-z\s-]*$", "ЕНП: допустимы цифры, латиница, пробел и дефис.")])

    class Meta:
        model = Patient
        fields = [
            "id", "status", "status_display", "surname", "firstname", "lastname", "full_name", "sex", "sex_name",
            "birthdate", "blood_group", "blood_group_name", "blood_rh", "blood_rh_name", "snils", "enp",
            "height", "weight", "operations", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]
        validators = []  # уникальность проверяется в validate() с понятным сообщением

    def _last_operation(self, obj: Patient):
        operations = list(obj.operations.all())
        return max(operations, key=lambda op: op.id) if operations else None

    def get_height(self, obj) -> float | None:
        op = self._last_operation(obj)
        return float(op.height) if op and op.height is not None else None

    def get_weight(self, obj) -> float | None:
        op = self._last_operation(obj)
        return float(op.weight) if op and op.weight is not None else None

    def validate_birthdate(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Дата рождения не может быть в будущем.")
        return value

    def validate(self, attrs):
        def current(field):
            return attrs.get(field, getattr(self.instance, field, None) if self.instance else None)

        duplicates = Patient.objects.filter(
            surname=current("surname"), firstname=current("firstname"), lastname=current("lastname") or "",
            birthdate=current("birthdate"), sex=current("sex"),
        )
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            fio = " ".join(filter(None, [current("surname"), current("firstname"), current("lastname")]))
            raise serializers.ValidationError({"non_field_errors": [f"Пациент {fio} уже существует."]})
        return attrs
