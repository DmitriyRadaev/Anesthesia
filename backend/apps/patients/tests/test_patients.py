from datetime import date, time, timedelta

import pytest

from apps.accounts.models import Role
from apps.operations.models import Operation
from apps.patients.models import Patient

pytestmark = pytest.mark.django_db

URL = "/api/patients/"
NEW_PATIENT = {
    "surname": "Иванов",
    "firstname": "Иван",
    "lastname": "Иванович",
    "sex": 1,
    "birthdate": "1975-03-12",
    "blood_group": 2,
    "blood_rh": 2,
}


@pytest.mark.parametrize("role", [Role.DOCTOR, Role.HEAD, Role.ACTING_HEAD])
def test_create_patient_allowed_roles(client_for, make_user, role):
    response = client_for(make_user(role)).post(URL, NEW_PATIENT)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["status"] == Patient.Status.NEW
    assert body["full_name"] == "Иванов Иван Иванович"
    assert body["operations"] == []


@pytest.mark.parametrize("role", [Role.NURSE, Role.ADMIN])
def test_create_patient_forbidden_roles(client_for, make_user, role):
    assert client_for(make_user(role)).post(URL, NEW_PATIENT).status_code == 403


def test_admin_has_no_access_to_clinical_data(client_for, admin_user, make_patient):
    patient = make_patient()
    client = client_for(admin_user)
    assert client.get(URL).status_code == 403
    assert client.get(f"{URL}{patient.id}/").status_code == 403


def test_nurse_can_read_patients(client_for, nurse, make_patient):
    patient = make_patient()
    client = client_for(nurse)
    assert client.get(URL).status_code == 200
    assert client.get(f"{URL}{patient.id}/").status_code == 200
    assert client.patch(f"{URL}{patient.id}/", {"firstname": "Пётр"}).status_code == 403


def test_patient_validation(client_for, doctor):
    client = client_for(doctor)
    bad = client.post(URL, {**NEW_PATIENT, "surname": "Ivanov1", "sex": 99, "birthdate": "not-a-date"})
    assert bad.status_code == 400
    assert {"surname", "sex", "birthdate"} <= set(bad.json()["errors"])
    future = client.post(URL, {**NEW_PATIENT, "birthdate": (date.today() + timedelta(days=2)).isoformat()})
    assert future.status_code == 400 and "birthdate" in future.json()["errors"]
    missing = client.post(URL, {"surname": "Иванов"})
    assert missing.status_code == 400
    assert {"firstname", "sex", "birthdate", "blood_group", "blood_rh"} <= set(missing.json()["errors"])
    snils = client.post(URL, {**NEW_PATIENT, "snils": "12A"})
    assert snils.status_code == 400 and "snils" in snils.json()["errors"]


def test_duplicate_patient_rejected(client_for, doctor):
    client = client_for(doctor)
    assert client.post(URL, NEW_PATIENT).status_code == 201
    duplicate = client.post(URL, NEW_PATIENT)
    assert duplicate.status_code == 400
    assert "уже существует" in duplicate.json()["detail"]


def test_update_patient(client_for, doctor, make_patient):
    patient = make_patient()
    response = client_for(doctor).patch(f"{URL}{patient.id}/", {"firstname": "Семён", "status": 3})
    assert response.status_code == 200
    patient.refresh_from_db()
    assert patient.firstname == "Семён"
    assert patient.status == Patient.Status.NEW  # статус меняется только бизнес-операциями


def test_retrieve_contains_operations_and_last_height_weight(client_for, doctor, make_operation):
    op_old = make_operation(height=170, weight=70, status=Operation.Status.FINISHED)
    make_operation(patient=op_old.patient, height=171, weight=75)
    body = client_for(doctor).get(f"{URL}{op_old.patient_id}/").json()
    assert len(body["operations"]) == 2
    assert body["height"] == 171.0 and body["weight"] == 75.0
    assert body["operations"][0]["status"] == Operation.Status.ARRIVED  # активные ОС первыми


def test_registry_filters_search_pagination(client_for, doctor, nurse, make_patient, make_operation):
    archive = make_patient(surname="Архипов", status=Patient.Status.ARCHIVE)
    active = make_patient(surname="Активов", status=Patient.Status.ACTIVE)
    make_patient(surname="Новиков", status=Patient.Status.NEW)
    make_operation(patient=active, doctor=doctor)
    make_operation(patient=archive, nurse=nurse, status=Operation.Status.FINISHED)
    client = client_for(doctor)

    body = client.get(URL).json()
    assert body["count"] == 3
    assert [p["surname"] for p in body["results"]] == ["Новиков", "Активов", "Архипов"]  # по статусу карточки
    assert [p["surname"] for p in client.get(URL, {"status": 3}).json()["results"]] == ["Архипов"]
    assert [p["surname"] for p in client.get(URL, {"search_surname": " ак"}).json()["results"]] == ["Активов"]
    assert [p["surname"] for p in client.get(URL, {"mine": "true"}).json()["results"]] == ["Активов"]
    assert [p["surname"] for p in client_for(nurse).get(URL, {"mine": "true"}).json()["results"]] == ["Архипов"]

    paged = client.get(URL, {"page_size": 2, "page": 2}).json()
    assert len(paged["results"]) == 1 and paged["previous"] is not None


def test_registry_orders_by_latest_operation(client_for, doctor, make_patient, make_operation):
    first = make_patient(surname="Ранний", status=Patient.Status.ACTIVE)
    second = make_patient(surname="Поздний", status=Patient.Status.ACTIVE)
    make_operation(patient=first, operation_date=date(2026, 1, 1), operation_time=time(8))
    make_operation(patient=second, operation_date=date(2026, 2, 1), operation_time=time(8))
    names = [p["surname"] for p in client_for(doctor).get(URL).json()["results"]]
    assert names == ["Поздний", "Ранний"]


def test_archive_rules(client_for, doctor, make_operation, make_patient):
    op = make_operation()
    client = client_for(doctor)
    blocked = client.post(f"{URL}{op.patient_id}/archive/")
    assert blocked.status_code == 409
    assert "ПОСТУПИЛ или НА ОПЕРАЦИИ" in blocked.json()["detail"]

    op.status = Operation.Status.FINISHED
    op.save()
    assert client.post(f"{URL}{op.patient_id}/archive/").json()["status"] == Patient.Status.ARCHIVE
    assert client.post(f"{URL}{op.patient_id}/unarchive/").json()["status"] == Patient.Status.ACTIVE


def test_nurse_cannot_archive(client_for, nurse, make_patient):
    assert client_for(nurse).post(f"{URL}{make_patient().id}/archive/").status_code == 403


def test_delete_patient_rules(client_for, doctor, head, make_patient, make_operation):
    lonely = make_patient()
    with_ops = make_operation().patient
    assert client_for(doctor).delete(f"{URL}{lonely.id}/").status_code == 403
    assert client_for(head).delete(f"{URL}{with_ops.id}/").status_code == 409
    assert client_for(head).delete(f"{URL}{lonely.id}/").status_code == 204
    assert not Patient.objects.filter(pk=lonely.id).exists()


def test_not_found(client_for, doctor):
    response = client_for(doctor).get(f"{URL}999999/")
    assert response.status_code == 404
    assert response.json()["detail"]
