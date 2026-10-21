import secrets
from datetime import timedelta

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import CLINICAL_ROLES, SUPERVISOR_ROLES
from apps.accounts.permissions import IsClinicalStaff
from apps.operations.models import Operation
from apps.operations.nested import OperationScopedView

from .hl7 import HL7ParseError
from .ingest import store_message
from .models import HL7Result
from .services import latest_vitals, operation_window

TAGS = ["Мониторинг (HL7)"]


def _has_valid_api_key(request) -> bool:
    expected = settings.INTEGRATION_API_KEY
    provided = request.headers.get("X-API-Key", "")
    return bool(expected) and secrets.compare_digest(provided, expected)


class ApiKeyOrRole(BasePermission):
    """Доступ по ключу интеграции (`X-API-Key`) или пользователю с одной из ролей `roles`."""

    roles = CLINICAL_ROLES
    message = "Требуется авторизация пользователя или ключ интеграции X-API-Key."

    def has_permission(self, request, view):
        if _has_valid_api_key(request):
            return True
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.roles)


class ApiKeyOrSupervisor(ApiKeyOrRole):
    roles = SUPERVISOR_ROLES


class HL7ResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = HL7Result
        fields = ["observation_at", "pid", "department", "room", "bed", "device", "observations"]


def _parse_dt(value: str | None):
    if not value:
        return None
    parsed = serializers.DateTimeField().to_internal_value(value)
    return parsed


class OperationResultsView(OperationScopedView):
    @extend_schema(
        tags=TAGS,
        summary="Показатели мониторов по ОС (для графиков)",
        description="По умолчанию — окно ОС (поступление −5 мин … окончание анестезии/сейчас). "
                    "`date_start` — вернуть измерения строго после указанного момента (инкрементальная подгрузка).",
        parameters=[OpenApiParameter("date_start", OpenApiTypes.DATETIME), OpenApiParameter("date_end", OpenApiTypes.DATETIME)],
        responses=inline_serializer("OperationResults", {
            "pid": serializers.CharField(), "count": serializers.IntegerField(),
            "results": HL7ResultSerializer(many=True),
        }),
    )
    def get(self, request, operation_id):
        operation = self.get_operation()
        try:
            date_start = _parse_dt(request.query_params.get("date_start"))
            date_end = _parse_dt(request.query_params.get("date_end"))
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"date": exc.detail})
        window = operation_window(operation)
        qs = HL7Result.objects.filter(pid=operation.pid) if operation.pid else HL7Result.objects.none()
        if date_start is not None:
            qs = qs.filter(observation_at__gt=date_start)
        elif window is not None:
            qs = qs.filter(observation_at__gte=window.start)
        if date_end is not None:
            qs = qs.filter(observation_at__lte=date_end)
        elif window is not None:
            qs = qs.filter(observation_at__lte=window.end)
        rows = list(qs.order_by("observation_at")[:5000])
        return Response({"pid": operation.pid, "count": len(rows), "results": HL7ResultSerializer(rows, many=True).data})


class RecentPidsView(APIView):
    permission_classes = [IsClinicalStaff]

    @extend_schema(
        tags=TAGS, summary="PID, от которых поступали данные за последние N минут (по умолчанию 10)",
        parameters=[OpenApiParameter("minutes", OpenApiTypes.INT)],
        responses=inline_serializer("RecentPids", {"pids": serializers.ListField(child=serializers.CharField())}),
    )
    def get(self, request):
        try:
            minutes = max(1, min(int(request.query_params.get("minutes", 10)), 24 * 60))
        except ValueError:
            minutes = 10
        since = timezone.now() - timedelta(minutes=minutes)
        pids = (HL7Result.objects.filter(observation_at__gt=since).order_by("pid").values_list("pid", flat=True).distinct())
        return Response({"pids": list(pids)})


class CDSSView(APIView):
    permission_classes = [ApiKeyOrRole]
    throttle_scope = "cdss"

    @extend_schema(
        tags=TAGS, summary="Последние показатели пациента для СППВР (CDSS)",
        description="Доступ: токен клинического пользователя или заголовок `X-API-Key` (INTEGRATION_API_KEY).",
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, operation_id):
        operation = get_object_or_404(Operation, pk=operation_id)
        return Response(latest_vitals(operation))


class HL7IngestView(APIView):
    """Приём HL7-сообщения по HTTP (альтернатива TCP-приёмнику `hl7_listener`)."""

    permission_classes = [ApiKeyOrSupervisor]

    @extend_schema(
        tags=TAGS, summary="Принять HL7-сообщение (ORU^R01)",
        description="Тело: `{\"message\": \"MSH|...\\rPID|...\\rOBR|...\\rOBX|...\"}`. "
                    "Доступ: `X-API-Key` или пользователь с ролью заведующего/ИО.",
        request=inline_serializer("HL7IngestRequest", {"message": serializers.CharField()}),
        responses={201: HL7ResultSerializer},
    )
    def post(self, request):
        message = request.data.get("message") if isinstance(request.data, dict) else None
        if not message or not isinstance(message, str):
            raise serializers.ValidationError({"message": ["Передайте текст HL7-сообщения."]})
        try:
            result = store_message(message)
        except HL7ParseError as exc:
            raise serializers.ValidationError({"message": [str(exc)]})
        return Response(HL7ResultSerializer(result).data, status=status.HTTP_201_CREATED)
