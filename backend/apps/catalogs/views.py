from functools import cache

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .registry import CATALOGS

TAGS = ["Справочники"]


class CatalogItemSerializer(serializers.Serializer):
    """Общая форма элемента справочника (у части справочников есть дополнительные поля)."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    code = serializers.CharField(required=False)
    description = serializers.CharField(required=False)


class DoctorItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source="full_name")


@cache
def serializer_for(model):
    meta = type("Meta", (), {"model": model, "fields": "__all__"})
    return type(f"{model.__name__}CatalogSerializer", (serializers.ModelSerializer,), {"Meta": meta})


class CatalogIndexView(APIView):
    @extend_schema(
        tags=TAGS,
        operation_id="catalogs_index",
        summary="Перечень доступных справочников",
        responses=inline_serializer("CatalogIndex", {"slug": serializers.CharField(), "title": serializers.CharField()},
                                    many=True),
    )
    def get(self, request):
        return Response([{"slug": slug, "title": entry.title} for slug, entry in sorted(CATALOGS.items())])


class CatalogView(APIView):
    @extend_schema(
        tags=TAGS,
        operation_id="catalogs_items",
        summary="Элементы справочника",
        description=(
            "Доступные slug: " + ", ".join(sorted(CATALOGS)) + ". "
            "Для `department` обязателен параметр `department_type_id`; "
            "для `scale_glazgo`/`scale_meyo` можно передать `head_id`; для `anesthesia_method` — `type`."
        ),
        parameters=[
            OpenApiParameter("slug", OpenApiTypes.STR, OpenApiParameter.PATH, enum=sorted(CATALOGS)),
            OpenApiParameter("department_type_id", OpenApiTypes.INT, required=False),
            OpenApiParameter("head_id", OpenApiTypes.INT, required=False),
            OpenApiParameter("type", OpenApiTypes.STR, required=False),
        ],
        responses=CatalogItemSerializer(many=True),
    )
    def get(self, request, slug: str):
        entry = CATALOGS.get(slug)
        if entry is None:
            raise NotFound(f"Справочник «{slug}» не найден.")
        missing = [p for p in entry.required_params if not request.query_params.get(p)]
        if missing:
            raise ValidationError({p: ["Обязательный параметр."] for p in missing})

        qs = entry.get_queryset()
        lookups = {}
        for param, lookup in entry.query_filters.items():
            value = request.query_params.get(param)
            if value not in (None, ""):
                lookups[lookup] = value
        try:
            qs = qs.filter(**lookups)
            items = list(qs)
        except (ValueError, TypeError):
            raise ValidationError({"detail": "Некорректное значение параметра фильтрации."})

        serializer_class = DoctorItemSerializer if slug == "doctor_fio" else serializer_for(entry.model)
        return Response(serializer_class(items, many=True).data)
