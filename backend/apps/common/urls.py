from django.db import connection
from django.urls import path
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@extend_schema(
    tags=["Служебное"],
    summary="Проверка работоспособности (API + БД)",
    responses=inline_serializer("Health", {"status": serializers.CharField(), "database": serializers.CharField()}),
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return Response({"status": "ok", "database": connection.vendor})


urlpatterns = [path("", health, name="health")]
