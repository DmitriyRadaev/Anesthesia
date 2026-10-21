from rest_framework import serializers

from apps.accounts.models import User

from .models import Operation


class PatientSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    surname = serializers.CharField()
    firstname = serializers.CharField()
    lastname = serializers.CharField()
    full_name = serializers.CharField()
    sex = serializers.IntegerField(source="sex_id")
    birthdate = serializers.DateField()
    blood_group = serializers.IntegerField(source="blood_group_id")
    blood_rh = serializers.IntegerField(source="blood_rh_id")
    status = serializers.IntegerField()


class OperationSerializer(serializers.ModelSerializer):
    """Полная информация об ОС (аналог operations_show исходной системы)."""

    patient_info = PatientSummarySerializer(source="patient", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    type_operation_name = serializers.CharField(source="type_operation.name", read_only=True)
    doctor_name = serializers.CharField(source="doctor.full_name", read_only=True, default=None)
    nurse_name = serializers.CharField(source="nurse.full_name", read_only=True, default=None)
    bmi = serializers.FloatField(read_only=True)
    is_anesthesia_started = serializers.BooleanField(read_only=True)
    is_anesthesia_stopped = serializers.BooleanField(read_only=True)

    class Meta:
        model = Operation
        fields = [
            "id", "patient", "patient_info", "status", "status_display", "operation_date", "operation_time", "pid",
            "type_operation", "type_operation_name", "operation_name", "operation_code", "federal_code",
            "diagnosis", "diagnosis_name", "history_number", "asa", "volume_operation", "department", "ventilator",
            "monitoring", "complaints_patient", "features_anamnesis", "drug_intolerance", "height", "weight", "bmi",
            "reason_cancel", "doctor", "doctor_name", "nurse", "nurse_name",
            "is_anesthesia_started", "is_anesthesia_stopped", "created_at", "updated_at",
        ]
        read_only_fields = fields


class OperationWriteSerializer(serializers.ModelSerializer):
    """Создание/изменение ОС (карточка ОС)."""

    doctor = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), allow_null=True, required=False)
    nurse = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), allow_null=True, required=False)
    operation_date = serializers.DateField()

    class Meta:
        model = Operation
        fields = [
            "patient", "operation_date", "operation_time", "pid", "type_operation", "operation_name",
            "operation_code", "diagnosis", "diagnosis_name", "history_number", "doctor", "nurse", "height", "weight",
        ]

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            fields["patient"].read_only = True
        return fields


class CancelOperationSerializer(serializers.Serializer):
    reason_cancel = serializers.CharField(max_length=500, help_text="Причина отмены ОС")
