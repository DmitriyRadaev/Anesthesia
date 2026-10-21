from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from apps.monitoring.services import cms_series
from apps.operations.nested import CollectionBlockView, OperationScopedView
from apps.operations.services import sync_status_with_actions

from . import services
from .models import (
    AnestheticAction,
    BreathCharacteristic,
    DrugAdministration,
    Infusion,
    Liquid,
    OperationStage,
    Transfusion,
)
from .serializers import (
    AnestheticActionSerializer,
    BreathCharacteristicsSerializer,
    CardPatientInfoSerializer,
    DoseTotalSerializer,
    DrugGroupSerializer,
    InfusionGroupSerializer,
    LiquidGroupSerializer,
    OperationStageSerializer,
    PidDateTimeSerializer,
    TransfusionGroupSerializer,
    validate_actions,
)

TAGS = ["Наркозная карта"]


class CardPatientInfoView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Сведения о пациенте и операции в наркозной карте",
                   responses=CardPatientInfoSerializer)
    def get(self, request, operation_id):
        return Response(CardPatientInfoSerializer(self.get_operation()).data)

    @extend_schema(tags=TAGS, summary="Изменить сведения о пациенте и операции в наркозной карте",
                   request=CardPatientInfoSerializer, responses=CardPatientInfoSerializer)
    def patch(self, request, operation_id):
        serializer = CardPatientInfoSerializer(self.get_operation(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PidDateTimeView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Изменить PID, дату операции и время поступления",
                   request=PidDateTimeSerializer, responses=PidDateTimeSerializer)
    def patch(self, request, operation_id):
        serializer = PidDateTimeSerializer(self.get_operation(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AnestheticActionsView(CollectionBlockView):
    serializer_class = AnestheticActionSerializer

    def get_queryset(self):
        return AnestheticAction.objects.filter(operation=self.get_operation()).order_by("time", "id")

    def validate_collection(self, items):
        validate_actions(items)

    def after_save(self):
        sync_status_with_actions(self.get_operation())

    @extend_schema(tags=TAGS, summary="Анестезиологические действия", responses=AnestheticActionSerializer(many=True))
    def get(self, request, operation_id):
        return super().get(request, operation_id)

    @extend_schema(
        tags=TAGS, summary="Заменить анестезиологические действия",
        description="Полная замена набора. Пересчитывает статус ОС: «Начало анестезии» → НА ОПЕРАЦИИ, иначе ПОСТУПИЛ "
                    "(для незавершённых и неотменённых ОС); карточка пациента становится АКТИВНОЙ.",
        request=AnestheticActionSerializer(many=True), responses=AnestheticActionSerializer(many=True),
    )
    def put(self, request, operation_id):
        return super().put(request, operation_id)


class BreathCharacteristicsView(OperationScopedView):
    def _payload(self):
        result = {t: [] for t in BreathCharacteristic.BreathType.values}
        for row in BreathCharacteristic.objects.filter(operation=self.get_operation()).order_by("time_start"):
            result[row.breath_type].append({"time_start": row.time_start, "time_end": row.time_end})
        return BreathCharacteristicsSerializer(result).data

    @extend_schema(tags=TAGS, summary="Характеристики дыхания", responses=BreathCharacteristicsSerializer)
    def get(self, request, operation_id):
        return Response(self._payload())

    @extend_schema(tags=TAGS, summary="Заменить характеристики дыхания", request=BreathCharacteristicsSerializer,
                   responses=BreathCharacteristicsSerializer)
    @transaction.atomic
    def put(self, request, operation_id):
        serializer = BreathCharacteristicsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operation = self.get_operation()
        BreathCharacteristic.objects.filter(operation=operation).delete()
        BreathCharacteristic.objects.bulk_create([
            BreathCharacteristic(operation=operation, breath_type=breath_type, **item)
            for breath_type, items in serializer.validated_data.items() for item in items
        ])
        return Response(self._payload())


class OperationStagesView(OperationScopedView):
    def _payload(self):
        services.ensure_stages(self.get_operation())
        return OperationStageSerializer(OperationStage.objects.filter(operation=self.get_operation()), many=True).data

    @extend_schema(tags=TAGS, summary="Этапы операции (6 этапов)", responses=OperationStageSerializer(many=True))
    def get(self, request, operation_id):
        return Response(self._payload())

    @extend_schema(tags=TAGS, summary="Изменить этапы операции", request=OperationStageSerializer(many=True),
                   responses=OperationStageSerializer(many=True))
    @transaction.atomic
    def put(self, request, operation_id):
        serializer = OperationStageSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        operation = self.get_operation()
        services.ensure_stages(operation)
        for item in serializer.validated_data:
            OperationStage.objects.filter(operation=operation, stage=item["stage"]).update(
                time_start=item.get("time_start"), description=item.get("description", "")
            )
        return Response(self._payload())


class GroupedCollectionView(OperationScopedView):
    """Набор строк, сгруппированных по наименованию: ``[{<group_field>: "...", "items": [...]}, ...]``."""

    model = None
    group_field = ""
    group_serializer_class = None
    item_fields: tuple = ()

    def get_filter(self) -> dict:
        return {}

    def get_queryset(self):
        return self.model.objects.filter(operation=self.get_operation(), **self.get_filter()).order_by("id")

    def serialize_item(self, row) -> dict:
        return {field: getattr(row, field) for field in self.item_fields}

    def _payload(self):
        groups: dict[str, list] = {}
        for row in self.get_queryset():
            groups.setdefault(getattr(row, self.group_field), []).append(self.serialize_item(row))
        data = [{self.group_field: name, "items": items} for name, items in groups.items()]
        return self.group_serializer_class(data, many=True).data

    def get(self, request, operation_id):
        return Response(self._payload())

    @transaction.atomic
    def put(self, request, operation_id):
        serializer = self.group_serializer_class(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        operation = self.get_operation()
        self.get_queryset().delete()
        rows = []
        for group in serializer.validated_data:
            for item in group["items"]:
                rows.append(self.model(operation=operation, **self.get_filter(),
                                       **{self.group_field: group[self.group_field]}, **item))
        self.model.objects.bulk_create(rows)
        return Response(self._payload())


SECTION_PARAM = OpenApiParameter("section", OpenApiTypes.STR, OpenApiParameter.PATH,
                                 enum=DrugAdministration.Section.values,
                                 description="premedication — премедикация, introduction — введение в анестезию, "
                                             "maintenance — поддержание анестезии")


class DrugsView(GroupedCollectionView):
    model = DrugAdministration
    group_field = "drug"
    group_serializer_class = DrugGroupSerializer

    def get_filter(self):
        section = self.kwargs["section"]
        if section not in DrugAdministration.Section.values:
            raise NotFound("Неизвестный раздел препаратов.")
        return {"section": section}

    def get_queryset(self):
        return super().get_queryset().select_related("measurement_unit")

    def serialize_item(self, row):
        return row  # DrugItemSerializer.to_representation работает с моделью

    @extend_schema(tags=TAGS, summary="Препараты раздела", parameters=[SECTION_PARAM],
                   responses=DrugGroupSerializer(many=True))
    def get(self, request, operation_id, section):
        return super().get(request, operation_id)

    @extend_schema(tags=TAGS, summary="Заменить препараты раздела", parameters=[SECTION_PARAM],
                   request=DrugGroupSerializer(many=True), responses=DrugGroupSerializer(many=True))
    def put(self, request, operation_id, section):
        return super().put(request, operation_id)


class DrugTotalsView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Итоговые дозы препаратов (по всем разделам)",
                   responses=DoseTotalSerializer(many=True))
    def get(self, request, operation_id):
        return Response(services.summarize_doses(services.drugs_for(self.get_operation())))


class InfusionsView(GroupedCollectionView):
    model = Infusion
    group_field = "solution"
    group_serializer_class = InfusionGroupSerializer
    item_fields = ("dose", "time_start", "time_end")

    @extend_schema(tags=TAGS, summary="Инфузионная терапия", responses=InfusionGroupSerializer(many=True))
    def get(self, request, operation_id):
        return super().get(request, operation_id)

    @extend_schema(tags=TAGS, summary="Заменить инфузионную терапию", request=InfusionGroupSerializer(many=True),
                   responses=InfusionGroupSerializer(many=True))
    def put(self, request, operation_id):
        return super().put(request, operation_id)


class TransfusionsView(GroupedCollectionView):
    model = Transfusion
    group_field = "solution"
    group_serializer_class = TransfusionGroupSerializer
    item_fields = ("gemakon", "time_start", "time_end")

    @extend_schema(tags=TAGS, summary="Трансфузионная терапия", responses=TransfusionGroupSerializer(many=True))
    def get(self, request, operation_id):
        return super().get(request, operation_id)

    @extend_schema(tags=TAGS, summary="Заменить трансфузионную терапию", request=TransfusionGroupSerializer(many=True),
                   responses=TransfusionGroupSerializer(many=True))
    def put(self, request, operation_id):
        return super().put(request, operation_id)


class LiquidsView(GroupedCollectionView):
    model = Liquid
    group_field = "liquid"
    group_serializer_class = LiquidGroupSerializer
    item_fields = ("volume", "time_start", "time_end")

    @extend_schema(tags=TAGS, summary="Жидкостные потери", responses=LiquidGroupSerializer(many=True))
    def get(self, request, operation_id):
        return super().get(request, operation_id)

    @extend_schema(tags=TAGS, summary="Заменить жидкостные потери", request=LiquidGroupSerializer(many=True),
                   responses=LiquidGroupSerializer(many=True))
    def put(self, request, operation_id):
        return super().put(request, operation_id)


class CMSView(OperationScopedView):
    @extend_schema(
        tags=TAGS, summary="Показатели мониторов для блока ЦМС (интервалы по 5 минут)",
        description="Окно: от времени поступления −5 минут до «Окончания анестезии» (или текущего момента), "
                    "не более 24 часов. Для каждого интервала берётся последнее сообщение монитора.",
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, operation_id):
        return Response(cms_series(self.get_operation()))


class CardPrintView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Данные для печатной формы наркозной карты", responses=OpenApiTypes.OBJECT)
    def get(self, request, operation_id):
        operation = self.get_operation()
        operation = type(operation).objects.select_related(
            "patient__sex", "patient__blood_group", "patient__blood_rh", "type_operation", "asa", "volume_operation",
            "department", "ventilator", "monitoring", "doctor", "nurse",
        ).get(pk=operation.pk)
        return Response(services.card_print_data(operation))
