from datetime import date, datetime

from rest_framework import serializers

from apps.catalogs.models import AnesthesiaMethod, Vein
from apps.operations.models import Operation

from . import models as m


class ProtocolPatientInfoSerializer(serializers.ModelSerializer):
    surname = serializers.CharField(source="patient.surname", read_only=True)
    firstname = serializers.CharField(source="patient.firstname", read_only=True)
    lastname = serializers.CharField(source="patient.lastname", read_only=True)
    birthdate = serializers.DateField(source="patient.birthdate", read_only=True)
    bmi = serializers.FloatField(read_only=True)

    class Meta:
        model = Operation
        fields = ["id", "surname", "firstname", "lastname", "birthdate", "height", "weight", "bmi",
                  "complaints_patient", "features_anamnesis", "operation_code", "operation_name", "diagnosis_name"]
        read_only_fields = ["id", "operation_code", "operation_name", "diagnosis_name"]


class AnesthesiaMethodBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnesthesiaMethod
        fields = ["id", "name"]


class InformationAnesthesiaSerializer(serializers.ModelSerializer):
    anesthesia_methods = serializers.PrimaryKeyRelatedField(
        queryset=AnesthesiaMethod.objects.all(), many=True, required=False, help_text="ID методов анестезии"
    )
    anesthesia_types = serializers.SerializerMethodField(help_text="Выбранные методы, сгруппированные GENERAL/LOCAL")
    date_arrival = serializers.SerializerMethodField()
    time_anesthesia_start = serializers.SerializerMethodField()

    class Meta:
        model = m.InformationAnesthesia
        fields = ["anesthesia_methods", "anesthesia_types", "patient_arrived", "date_arrival", "time_anesthesia_start"]

    def get_anesthesia_types(self, obj) -> dict:
        grouped = {kind: [] for kind in AnesthesiaMethod.Kind.values}
        if obj.pk:
            for method in obj.anesthesia_methods.order_by("id"):
                grouped[method.type].append(AnesthesiaMethodBriefSerializer(method).data)
        return grouped

    def to_representation(self, instance):
        data = super().to_representation(instance) if instance.pk else {
            "anesthesia_methods": [], "anesthesia_types": self.get_anesthesia_types(instance),
            "patient_arrived": instance.patient_arrived,
            "date_arrival": self.get_date_arrival(instance), "time_anesthesia_start": self.get_time_anesthesia_start(instance),
        }
        return data

    def get_date_arrival(self, obj) -> date | None:
        return obj.operation.operation_date

    def get_time_anesthesia_start(self, obj) -> datetime | None:
        from apps.card.models import AnestheticAction

        value = obj.operation.action_time(AnestheticAction.Value.ANESTHESIA_START)
        return serializers.DateTimeField().to_representation(value) if value else None


class VenousAccessSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.VenousAccess
        fields = ["id", "vein", "arm", "catheter_type", "catheter_diameter_1", "catheter_diameter_2",
                  "catheter_diameter_3"]
        read_only_fields = ["id"]

    def validate_vein(self, vein: Vein):
        kind = self.context["kind"]
        if vein.type != kind:
            raise serializers.ValidationError(f"Вена не относится к доступу {m.VenousAccess.Kind(kind).label}.")
        return vein


class PremedicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.Premedication
        fields = ["oxygen_mask_size", "is_oxygen_insufflation", "pharynx_tamponade", "rass", "note"]


class TubeInstallationPickSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.TubeInstallationPick
        fields = ["id", "tube_type", "option", "combi_tube_size", "intubation_tube_size", "pressure_type",
                  "tube_installed", "attempts"]
        read_only_fields = ["id"]
        validators = []


class LaryngealMaskInstallationSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.LaryngealMaskInstallation
        fields = ["id", "laryngeal_mask_type", "option", "option_ext", "blade_type", "blade_number", "tube_installed",
                  "attempts_number", "intuboscope_cuff_type", "intuboscope_cuff_size", "oropharyngeal_catheter",
                  "oropharyngeal_catheter_ext"]
        read_only_fields = ["id"]
        validators = []


# --- проходимость дыхательных путей: структура JSON-полей ---------------------------------------------------

class LaryngealTubeSerializer(serializers.Serializer):
    is_installed = serializers.BooleanField(default=False)
    size_id = serializers.IntegerField(allow_null=True, required=False, default=None)


class IntubationTubeSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["OROTRACHEAL", "NASOTRACHEAL", ""], allow_blank=True, default="")
    cuff = serializers.BooleanField(allow_null=True, required=False, default=None, help_text="Манжета низкого давления")
    size_id = serializers.IntegerField(allow_null=True, required=False, default=None)


class EndobronchialTubeSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["L", "R", ""], allow_blank=True, default="")
    size_id = serializers.IntegerField(allow_null=True, required=False, default=None)


class LaryngoscopySerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["DL", "VL", "VP", ""], allow_blank=True, default="",
                                   help_text="DL — прямая, VL — изогнутая, VP — с подвижным наконечником")
    blade_type_id = serializers.IntegerField(allow_null=True, required=False, default=None)


class SanationSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["OROPHARYNX", "TBD", "FBS"])
    catheter = serializers.CharField(allow_blank=True, required=False, default="", max_length=32)
    comment = serializers.CharField(allow_blank=True, required=False, default="", max_length=500)


class TubeMaskInstallationSerializer(serializers.ModelSerializer):
    laryngeal_tube = LaryngealTubeSerializer(required=False)
    intubation_tube = IntubationTubeSerializer(required=False)
    endobronchial_tube = EndobronchialTubeSerializer(required=False)
    laryngoscopy = LaryngoscopySerializer(required=False)
    sanacia = SanationSerializer(many=True, required=False)

    class Meta:
        model = m.TubeMaskInstallation
        fields = ["tube_installed", "attempts", "intubation_method", "laryngeal_tube", "intubation_tube",
                  "endobronchial_tube", "laryngoscopy", "sanacia"]

    def validate_sanacia(self, items):
        kinds = [item["type"] for item in items]
        if len(kinds) != len(set(kinds)):
            raise serializers.ValidationError("Каждый вид санации может быть указан один раз.")
        return items

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in ("laryngeal_tube", "intubation_tube", "endobronchial_tube", "laryngoscopy"):
            data[field] = self.fields[field].to_representation(getattr(instance, field) or {})
        return data


class RedirectingPatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.RedirectingPatient
        fields = ["department_type", "department", "doctor_fio"]

    def validate(self, attrs):
        department = attrs.get("department", getattr(self.instance, "department", None))
        department_type = attrs.get("department_type", getattr(self.instance, "department_type", None))
        if department is not None and department_type is not None and department.department_type_id != department_type.pk:
            raise serializers.ValidationError({"department": ["Отделение не соответствует выбранному типу."]})
        return attrs


class VentilatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.Ventilator
        fields = ["ventilator", "monitoring", "patient_status", "patient_status_value", "chamber", "bed", "note"]


class MaintainingAnesthesiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.MaintainingAnesthesia
        fields = ["anesthesia_specificity", "index_bis", "anesthesia_type", "symptomatic_picked", "symptomatic_option",
                  "oropharyngeal_catheter", "option_mg"]
        extra_kwargs = {"index_bis": {"min_value": 0, "max_value": 100}}


class ScaleSelectionField(serializers.JSONField):
    """Выбор по шкале: объект {раздел: значение}, не более 10 ключей, значения — строки/числа."""

    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        if data is None:
            return None
        if not isinstance(data, dict) or len(data) > 10:
            raise serializers.ValidationError("Ожидается объект {раздел: значение} (не более 10 разделов).")
        if not all(isinstance(v, (str, int, float)) or v is None for v in data.values()):
            raise serializers.ValidationError("Значения шкалы должны быть строками или числами.")
        return data


VITALS = {"min_value": 0, "max_value": 400}


class PatientTransferredSerializer(serializers.ModelSerializer):
    b_scale_meyo = ScaleSelectionField(required=False, allow_null=True)
    b_scale_glazgo = ScaleSelectionField(required=False, allow_null=True)
    t_scale_meyo = ScaleSelectionField(required=False, allow_null=True)
    t_scale_glazgo = ScaleSelectionField(required=False, allow_null=True)
    operation_duration = serializers.SerializerMethodField(help_text="Длительность операции (этап 1 → этап 6), ЧЧ:ММ")

    class Meta:
        model = m.PatientTransferred
        exclude = ["id", "operation"]
        extra_kwargs = {
            **{f"{p}_{v}": VITALS for p in ("b", "t") for v in ("ad", "ps", "spo2", "breath_rate", "cvp")},
            "b_spo2": {"min_value": 0, "max_value": 100},
            "t_spo2": {"min_value": 0, "max_value": 100},
        }

    def get_operation_duration(self, obj) -> str | None:
        from apps.card.services import format_hhmm, operation_duration_minutes

        return format_hhmm(operation_duration_minutes(obj.operation))
