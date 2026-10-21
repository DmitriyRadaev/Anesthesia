from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.operations.nested import OperationScopedView

from .models import LabResult
from .schema import clean_values, schema_payload

TAGS = ["Лабораторный мониторинг"]

LabResultResponse = inline_serializer("LabResult", {
    "values": serializers.DictField(help_text="{раздел: {показатель: значение}}"),
    "updated_at": serializers.DateTimeField(allow_null=True),
    "updated_by_name": serializers.CharField(allow_null=True),
})


def _payload(result: LabResult | None) -> dict:
    if result is None:
        return {"values": {}, "updated_at": None, "updated_by_name": None}
    return {
        "values": result.values,
        "updated_at": result.updated_at,
        "updated_by_name": result.updated_by.full_name if result.updated_by else None,
    }


class LabResultView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Результаты лабораторного мониторинга", responses=LabResultResponse)
    def get(self, request, operation_id):
        result = LabResult.objects.select_related("updated_by").filter(operation=self.get_operation()).first()
        return Response(_payload(result))

    @extend_schema(
        tags=TAGS, summary="Сохранить результаты лабораторного мониторинга",
        description="Полная замена значений. Структура и допустимые значения — `GET .../labs/schema/`.",
        request=inline_serializer("LabResultRequest", {"values": serializers.DictField()}),
        responses=LabResultResponse,
    )
    def put(self, request, operation_id):
        raw = request.data.get("values") if isinstance(request.data, dict) else None
        cleaned, errors = clean_values(raw if raw is not None else {})
        if errors:
            raise ValidationError(errors)
        result, _ = LabResult.objects.update_or_create(
            operation=self.get_operation(), defaults={"values": cleaned, "updated_by": request.user}
        )
        return Response(_payload(result))


class LabSchemaView(OperationScopedView):
    @extend_schema(tags=TAGS, summary="Структура формы лабораторного мониторинга", responses=OpenApiTypes.OBJECT)
    def get(self, request, operation_id):
        return Response(schema_payload())
