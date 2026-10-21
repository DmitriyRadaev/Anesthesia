from django.db.models import Exists, OuterRef, Q
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsClinicalStaff
from apps.card.models import AnestheticAction
from apps.common.filters import ChoiceListFilter

from . import services
from .models import Operation
from .serializers import (
    CancelOperationSerializer,
    OperationSerializer,
    OperationWriteSerializer,
)


def annotated_operations():
    actions = AnestheticAction.objects.filter(operation=OuterRef("pk"))
    return Operation.objects.select_related("patient", "type_operation", "doctor", "nurse").annotate(
        is_anesthesia_started=Exists(actions.filter(value=AnestheticAction.Value.ANESTHESIA_START)),
        is_anesthesia_stopped=Exists(actions.filter(value=AnestheticAction.Value.ANESTHESIA_STOP)),
    )


class OperationFilter(filters.FilterSet):
    status = ChoiceListFilter(choices=Operation.Status.choices)
    date_from = filters.DateFilter(field_name="operation_date", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="operation_date", lookup_expr="lte")
    mine = filters.BooleanFilter(method="filter_mine", label="Только ОС, где пользователь — врач или медсестра")

    class Meta:
        model = Operation
        fields = ["status", "patient", "type_operation", "doctor", "nurse"]

    def filter_mine(self, queryset, name, value):
        user = self.request.user
        return queryset.filter(Q(doctor=user) | Q(nurse=user)) if value else queryset


@extend_schema_view(
    list=extend_schema(summary="Список операционных случаев (фильтры, поиск, сортировка, пагинация)"),
    retrieve=extend_schema(summary="Операционный случай (полная информация)"),
    create=extend_schema(summary="Создать операционный случай", request=OperationWriteSerializer,
                         responses={201: OperationSerializer}),
    update=extend_schema(summary="Изменить операционный случай", request=OperationWriteSerializer,
                         responses=OperationSerializer),
    partial_update=extend_schema(summary="Частично изменить операционный случай", request=OperationWriteSerializer,
                                 responses=OperationSerializer),
)
@extend_schema(tags=["Операционные случаи"])
class OperationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                       mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Операционные случаи. Удаление ОС не предусмотрено (как в исходной системе) — используйте отмену."""

    permission_classes = [IsClinicalStaff]
    lookup_value_regex = r"\d+"
    filterset_class = OperationFilter
    search_fields = ["operation_name", "diagnosis_name", "pid", "patient__surname"]
    ordering_fields = ["operation_date", "operation_time", "status", "id", "created_at"]

    def get_queryset(self):
        return annotated_operations()

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return OperationWriteSerializer
        return OperationSerializer

    def _detail(self, operation: Operation, code=status.HTTP_200_OK) -> Response:
        return Response(OperationSerializer(self.get_queryset().get(pk=operation.pk)).data, status=code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operation = services.create_operation(request.user, serializer.validated_data)
        return self._detail(operation, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        operation = services.update_operation(request.user, instance, serializer.validated_data)
        return self._detail(operation)

    @extend_schema(summary="Отменить операционный случай", request=CancelOperationSerializer,
                   responses=OperationSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = CancelOperationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operation = services.cancel_operation(request.user, self.get_object(), serializer.validated_data["reason_cancel"])
        return self._detail(operation)

    @extend_schema(summary="Завершить операционный случай (требуется «Окончание анестезии»)", request=None,
                   responses=OperationSerializer)
    @action(detail=True, methods=["post"])
    def finish(self, request, pk=None):
        operation = services.finish_operation(request.user, self.get_object())
        return self._detail(operation)
