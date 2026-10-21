"""Базовые представления для блоков, вложенных в операционный случай: /api/operations/{operation_id}/..."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsClinicalStaff

from .models import Operation


class OperationScopedView(APIView):
    """Находит ОС по `operation_id` (404, если не найден). Доступ — клинический персонал."""

    permission_classes = [IsClinicalStaff]

    def get_operation(self) -> Operation:
        if not hasattr(self, "_operation"):
            self._operation = get_object_or_404(
                Operation.objects.select_related("patient"), pk=self.kwargs["operation_id"]
            )
        return self._operation


class SingletonBlockView(OperationScopedView):
    """Блок «один к одному» с ОС. GET возвращает пустую форму, если блок ещё не заполнен.

    PUT — полная замена значений, PATCH — частичное обновление.
    """

    model = None
    serializer_class = None

    def get_instance(self):
        operation = self.get_operation()
        return self.model.objects.filter(operation=operation).first() or self.model(operation=operation)

    def get_serializer(self, *args, **kwargs):
        kwargs.setdefault("context", {"request": self.request, "view": self, "operation": self.get_operation()})
        return self.serializer_class(*args, **kwargs)

    def get(self, request, operation_id):
        return Response(self.get_serializer(self.get_instance()).data)

    def put(self, request, operation_id):
        return self._save(request, partial=False)

    def patch(self, request, operation_id):
        return self._save(request, partial=True)

    @transaction.atomic
    def _save(self, request, partial: bool):
        instance = self.get_instance()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(operation=self.get_operation())
        return Response(serializer.data)


class CollectionBlockView(OperationScopedView):
    """Набор строк, принадлежащих ОС. PUT полностью заменяет набор (как PATCH исходной системы)."""

    serializer_class = None  # сериализатор одной строки

    def get_queryset(self):
        raise NotImplementedError

    def get_serializer(self, *args, **kwargs):
        kwargs.setdefault("context", {"request": self.request, "view": self, "operation": self.get_operation()})
        return self.serializer_class(*args, **kwargs)

    def validate_collection(self, items: list[dict]) -> None:
        """Проверки, затрагивающие весь набор (уникальность, пересечения и т.п.)."""

    def get(self, request, operation_id):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @transaction.atomic
    def put(self, request, operation_id):
        serializer = self.get_serializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        self.validate_collection(serializer.validated_data)
        self.get_queryset().delete()
        serializer.save(operation=self.get_operation(), **self.get_save_kwargs())
        self.after_save()
        return Response(self.get_serializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    def get_save_kwargs(self) -> dict:
        """Дополнительные значения полей для каждой сохраняемой строки."""
        return {}

    def after_save(self) -> None:
        """Хук для побочных эффектов после сохранения набора."""
