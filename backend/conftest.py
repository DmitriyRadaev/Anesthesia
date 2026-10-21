"""Общие фикстуры тестов. Тесты выполняются на PostgreSQL (тестовая БД создаётся автоматически)."""
from datetime import date, time

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import AuthToken, Role, User
from apps.operations.models import Operation
from apps.patients.models import Patient

TEST_PASSWORD = "Str0ng-Test-Pass!"


@pytest.fixture(autouse=True)
def _fast_hashing(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}


@pytest.fixture
def make_user(db):
    counter = {"n": 0}

    def factory(role=Role.DOCTOR, **kwargs):
        counter["n"] += 1
        password = kwargs.pop("password", TEST_PASSWORD)
        defaults = {
            "username": f"user{counter['n']}_{int(role)}",
            "surname": "Тестов",
            "firstname": "Пользователь",
            "lastname": "Иванович",
            "role": role,
        }
        defaults.update(kwargs)
        return User.objects.create_user(password=password, **defaults)

    return factory


@pytest.fixture
def client_for():
    def factory(user) -> APIClient:
        client = APIClient()
        _, key = AuthToken.objects.issue(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {key}")
        return client

    return factory


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def doctor(make_user):
    return make_user(Role.DOCTOR, surname="Врачев")


@pytest.fixture
def nurse(make_user):
    return make_user(Role.NURSE, surname="Сестрова")


@pytest.fixture
def head(make_user):
    return make_user(Role.HEAD, surname="Заведующий")


@pytest.fixture
def acting_head(make_user):
    return make_user(Role.ACTING_HEAD, surname="Исполняющий")


@pytest.fixture
def admin_user(make_user):
    return make_user(Role.ADMIN, surname="Админов")


@pytest.fixture
def make_patient(db):
    counter = {"n": 0}

    def factory(**kwargs):
        counter["n"] += 1
        defaults = {
            "surname": f"Пациентов{'а' * counter['n']}",
            "firstname": "Пётр",
            "lastname": "Петрович",
            "sex_id": 1,
            "birthdate": date(1980, 5, 17),
            "blood_group_id": 1,
            "blood_rh_id": 2,
        }
        defaults.update(kwargs)
        return Patient.objects.create(**defaults)

    return factory


@pytest.fixture
def make_operation(make_patient):
    def factory(patient=None, **kwargs):
        patient = patient or make_patient(status=Patient.Status.ACTIVE)
        defaults = {
            "patient": patient,
            "operation_date": date(2026, 10, 1),
            "operation_time": time(9, 0),
            "operation_name": "Холецистэктомия",
            "type_operation_id": 3,
            "status": Operation.Status.ARRIVED,
            "pid": "PID-1",
        }
        defaults.update(kwargs)
        return Operation.objects.create(**defaults)

    return factory
