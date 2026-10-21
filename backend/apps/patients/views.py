from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import PatientAccess
from apps.common.filters import ChoiceListFilter

from . import services
from .models import Patient
from .serializers import PatientSerializer


class PatientFilter(filters.FilterSet):
    status = ChoiceListFilter(choices=Patient.Status.choices)
    search_surname = filters.CharFilter(method="filter_surname", label="Начало фамилии (без учёта регистра)")
    mine = filters.BooleanFilter(method="filter_mine", label="Только пациенты текущего пользователя")

    class Meta:
        model = Patient
        fields = ["status", "sex"]

    def filter_surname(self, queryset, name, value):
        value = value.strip()
        return queryset.filter(surname__istartswith=value) if value else queryset

    def filter_mine(self, queryset, name, value):
        return services.filter_by_staff(queryset, self.request.user) if value else queryset


@extend_schema_view(
    list=extend_schema(
        summary="Реестр пациентов",
        description=(
            "Реестр с вложенными операционными случаями. Сортировка по умолчанию повторяет исходную систему: "
            "статус карточки → статус актуального ОС → дата/время операции (по убыванию). "
            "Фильтры: `status` (1 — новая, 2 — активная, 3 — архивная; можно несколько), "
            "`search_surname` (начало фамилии), `mine=true` («Мои пациенты»). Пагинация по 20."
        ),
    ),
    retrieve=extend_schema(summary="Карточка пациента"),
    create=extend_schema(summary="Создать карточку пациента"),
    update=extend_schema(summary="Изменить карточку пациента"),
    partial_update=extend_schema(summary="Частично изменить карточку пациента"),
    destroy=extend_schema(summary="Удалить карточку пациента (только без ОС; заведующий/ИО)"),
)
@extend_schema(tags=["Пациенты"])
class PatientViewSet(viewsets.ModelViewSet):
    serializer_class = PatientSerializer
    permission_classes = [PatientAccess]
    lookup_value_regex = r"\d+"
    filterset_class = PatientFilter
    search_fields = ["surname", "firstname", "lastname", "snils", "enp"]
    ordering_fields = ["surname", "birthdate", "created_at", "status"]

    def get_queryset(self):
        return services.registry_queryset()

    def perform_destroy(self, instance):
        services.delete_patient(instance)

    @extend_schema(summary="Перевести карточку в архив", request=None, responses=PatientSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        patient = services.archive_patient(self.get_object())
        return Response(self.get_serializer(patient).data)

    @extend_schema(summary="Вернуть карточку из архива (статус «Активная»)", request=None, responses=PatientSerializer)
    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        patient = services.unarchive_patient(self.get_object())
        return Response(self.get_serializer(patient).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        patient = serializer.save(status=Patient.Status.NEW)
        return Response(self.get_serializer(self.get_queryset().get(pk=patient.pk)).data, status=status.HTTP_201_CREATED)
