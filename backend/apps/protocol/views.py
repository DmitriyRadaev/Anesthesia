from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.operations.nested import (
    CollectionBlockView,
    OperationScopedView,
    SingletonBlockView,
)

from . import models as m
from . import serializers as s
from .services import protocol_print_data

TAGS = ["Протокол анестезии"]


def singleton_schema(title: str, serializer):
    return extend_schema_view(
        get=extend_schema(tags=TAGS, summary=title, responses=serializer),
        put=extend_schema(tags=TAGS, summary=f"{title}: полная замена", request=serializer, responses=serializer),
        patch=extend_schema(tags=TAGS, summary=f"{title}: частичное изменение", request=serializer, responses=serializer),
    )


def collection_schema(title: str, serializer):
    return extend_schema_view(
        get=extend_schema(tags=TAGS, summary=title, responses=serializer(many=True)),
        put=extend_schema(tags=TAGS, summary=f"{title}: заменить набор", request=serializer(many=True),
                          responses=serializer(many=True)),
    )


class ProtocolPatientInfoView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Сведения о пациенте в протоколе", responses=s.ProtocolPatientInfoSerializer)
    def get(self, request, operation_id):
        return Response(s.ProtocolPatientInfoSerializer(self.get_operation()).data)

    @extend_schema(tags=TAGS, summary="Изменить жалобы, анамнез, рост и вес", request=s.ProtocolPatientInfoSerializer,
                   responses=s.ProtocolPatientInfoSerializer)
    def patch(self, request, operation_id):
        serializer = s.ProtocolPatientInfoSerializer(self.get_operation(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@singleton_schema("Сведения об анестезии", s.InformationAnesthesiaSerializer)
class InformationAnesthesiaView(SingletonBlockView):
    model = m.InformationAnesthesia
    serializer_class = s.InformationAnesthesiaSerializer


class VenousAccessView(CollectionBlockView):
    serializer_class = s.VenousAccessSerializer
    kind: int = 0

    def get_serializer(self, *args, **kwargs):
        kwargs.setdefault("context", {"request": self.request, "view": self, "kind": self.kind})
        return super().get_serializer(*args, **kwargs)

    def get_queryset(self):
        return m.VenousAccess.objects.filter(operation=self.get_operation(), kind=self.kind)

    def get_save_kwargs(self):
        return {"kind": self.kind}


@collection_schema("Венозный доступ ПВК", s.VenousAccessSerializer)
class VenousAccessPVCView(VenousAccessView):
    kind = m.VenousAccess.Kind.PVC


@collection_schema("Венозный доступ ЦВК", s.VenousAccessSerializer)
class VenousAccessCVCView(VenousAccessView):
    kind = m.VenousAccess.Kind.CVC


@singleton_schema("Премедикация", s.PremedicationSerializer)
class PremedicationView(SingletonBlockView):
    model = m.Premedication
    serializer_class = s.PremedicationSerializer


class _UniqueByFieldCollection(CollectionBlockView):
    unique_field = ""
    unique_message = ""

    def validate_collection(self, items):
        values = [item[self.unique_field].pk for item in items]
        if len(values) != len(set(values)):
            raise ValidationError({self.unique_field: [self.unique_message]})


@collection_schema("Установка трубок", s.TubeInstallationPickSerializer)
class TubeInstallationsView(_UniqueByFieldCollection):
    serializer_class = s.TubeInstallationPickSerializer
    unique_field = "tube_type"
    unique_message = "Каждый тип трубки может быть указан один раз."

    def get_queryset(self):
        return m.TubeInstallationPick.objects.filter(operation=self.get_operation()).order_by("tube_type_id")


@collection_schema("Установка ларингеальных масок", s.LaryngealMaskInstallationSerializer)
class LaryngealMasksView(_UniqueByFieldCollection):
    serializer_class = s.LaryngealMaskInstallationSerializer
    unique_field = "laryngeal_mask_type"
    unique_message = "Каждый тип маски может быть указан один раз."

    def get_queryset(self):
        return m.LaryngealMaskInstallation.objects.filter(operation=self.get_operation()).order_by("laryngeal_mask_type_id")


@singleton_schema("Обеспечение проходимости дыхательных путей", s.TubeMaskInstallationSerializer)
class AirwayView(SingletonBlockView):
    model = m.TubeMaskInstallation
    serializer_class = s.TubeMaskInstallationSerializer


@singleton_schema("Направление пациента", s.RedirectingPatientSerializer)
class RedirectingPatientView(SingletonBlockView):
    model = m.RedirectingPatient
    serializer_class = s.RedirectingPatientSerializer


@singleton_schema("Аппарат ИВЛ (НДА) и мониторинг", s.VentilatorSerializer)
class VentilatorView(SingletonBlockView):
    model = m.Ventilator
    serializer_class = s.VentilatorSerializer


@singleton_schema("Поддержание анестезии", s.MaintainingAnesthesiaSerializer)
class MaintainingAnesthesiaView(SingletonBlockView):
    model = m.MaintainingAnesthesia
    serializer_class = s.MaintainingAnesthesiaSerializer


@singleton_schema("Пациент передан", s.PatientTransferredSerializer)
class PatientTransferredView(SingletonBlockView):
    model = m.PatientTransferred
    serializer_class = s.PatientTransferredSerializer


class ProtocolPrintView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Данные для печатной формы протокола анестезии", responses=OpenApiTypes.OBJECT)
    def get(self, request, operation_id):
        operation = self.get_operation()
        operation = type(operation).objects.select_related("patient", "doctor", "nurse").get(pk=operation.pk)
        return Response(protocol_print_data(operation))
