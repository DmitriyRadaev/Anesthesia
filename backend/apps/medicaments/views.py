from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers, viewsets

from apps.accounts.permissions import IsClinicalStaff

from .models import Medicament


class MedicamentSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)

    class Meta:
        model = Medicament
        fields = ["id", "name", "group", "group_name"]


class MedicamentFilter(filters.FilterSet):
    search_name = filters.CharFilter(field_name="name", lookup_expr="istartswith", label="Начало наименования")

    class Meta:
        model = Medicament
        fields = ["group"]


@extend_schema_view(
    list=extend_schema(summary="Поиск медикаментов", description="`search_name` — начало наименования "
                                                                 "(без учёта регистра); пагинация по 20."),
    retrieve=extend_schema(summary="Медикамент"),
)
@extend_schema(tags=["Медикаменты"])
class MedicamentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Medicament.objects.select_related("group").order_by("name")
    serializer_class = MedicamentSerializer
    permission_classes = [IsClinicalStaff]
    filterset_class = MedicamentFilter
    search_fields = ["name"]
    ordering_fields = ["name", "id"]
