"""Единый формат ошибок API.

Любая ошибка возвращается как JSON: ``{"detail": "<текст>", "code": "<код>", "errors": {<поле>: [..]}}``.
Ключ ``errors`` присутствует только для ошибок валидации.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import exceptions, status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler


class BusinessRuleViolation(APIException):
    """Нарушение бизнес-правила (состояние ресурса не позволяет выполнить действие)."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Действие недоступно в текущем состоянии."
    default_code = "conflict"


def _first_message(errors) -> str:
    if isinstance(errors, dict):
        for value in errors.values():
            return _first_message(value)
    if isinstance(errors, list) and errors:
        return _first_message(errors[0])
    return str(errors)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    if isinstance(exc, IntegrityError):
        exc = BusinessRuleViolation("Нарушена целостность данных: запись конфликтует с существующей.")

    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    code = getattr(exc, "default_code", "error")
    if isinstance(exc, exceptions.ValidationError):
        errors = data if isinstance(data, dict) else {"non_field_errors": data}
        body = {"detail": _first_message(errors), "code": "invalid", "errors": errors}
    elif isinstance(data, dict) and "detail" in data:
        detail = data["detail"]
        body = {"detail": str(detail), "code": getattr(detail, "code", code)}
    else:
        body = {"detail": _first_message(data), "code": code}
    return Response(body, status=response.status_code, headers=response.headers)
