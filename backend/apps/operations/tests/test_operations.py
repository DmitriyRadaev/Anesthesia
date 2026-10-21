from datetime import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.card.models import AnestheticAction
from apps.operations.models import Operation
from apps.patients.models import Patient

pytestmark = pytest.mark.django_db

URL = "/api/operations/"


def payload(patient, **extra):
    return {"patient": patient.id, "operation_date": "2026-10-20", "type_operation": 3,
            "operation_name": "Аппендэктомия", "pid": "M-100", **extra}


def aware(*args):
    return timezone.make_aware(datetime(*args))


def test_doctor_creates_operation_for_self(client_for, doctor, nurse, make_patient):
    patient = make_patient()
    response = client_for(doctor).post(URL, payload(patient, doctor=doctor.id, nurse=nurse.id, height="180", weight="80.5"))
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["status"] == Operation.Status.ARRIVED
    assert body["doctor_name"] == doctor.full_name and body["nurse_name"] == nurse.full_name
    assert body["bmi"] == 24.8
    patient.refresh_from_db()
    assert patient.status == Patient.Status.ACTIVE


def test_doctor_cannot_assign_other_doctor(client_for, doctor, make_user, make_patient):
    other = make_user(Role.DOCTOR)
    assert client_for(doctor).post(URL, payload(make_patient(), doctor=other.id)).status_code == 403


@pytest.mark.parametrize("role", [Role.NURSE, Role.ADMIN])
def test_operation_create_forbidden(client_for, make_user, make_patient, role):
    assert client_for(make_user(role)).post(URL, payload(make_patient())).status_code == 403


def test_head_can_assign_any_doctor(client_for, head, doctor, make_patient):
    response = client_for(head).post(URL, payload(make_patient(), doctor=doctor.id))
    assert response.status_code == 201


def test_staff_roles_validated(client_for, head, doctor, nurse, make_patient):
    response = client_for(head).post(URL, payload(make_patient(), doctor=nurse.id, nurse=doctor.id))
    assert response.status_code == 400
    assert {"doctor", "nurse"} <= set(response.json()["errors"])


def test_cannot_create_for_active_patient(client_for, head, make_operation):
    op = make_operation()
    response = client_for(head).post(URL, payload(op.patient))
    assert response.status_code == 409
    assert "АКТИВНЫЙ" in response.json()["detail"]


def test_cannot_create_when_active_case_exists(client_for, head, make_operation):
    op = make_operation()
    op.patient.status = Patient.Status.ARCHIVE
    op.patient.save()
    response = client_for(head).post(URL, payload(op.patient))
    assert response.status_code == 409


def test_create_validation(client_for, head, make_patient):
    response = client_for(head).post(URL, {"patient": make_patient().id})
    assert response.status_code == 400
    assert {"operation_date", "type_operation", "operation_name"} <= set(response.json()["errors"])
    too_tall = client_for(head).post(URL, payload(make_patient(), height=301))
    assert too_tall.status_code == 400 and "height" in too_tall.json()["errors"]


def test_update_operation(client_for, doctor, make_operation):
    op = make_operation(doctor=doctor)
    response = client_for(doctor).patch(f"{URL}{op.id}/", {"operation_name": "Лапароскопия", "pid": "M-200"})
    assert response.status_code == 200
    assert response.json()["operation_name"] == "Лапароскопия"
    assert client_for(doctor).patch(f"{URL}{op.id}/", {"patient": 12345}).json()["patient"] == op.patient_id


def test_list_filters(client_for, doctor, nurse, make_operation):
    make_operation(doctor=doctor)
    make_operation(nurse=nurse, status=Operation.Status.FINISHED)
    client = client_for(nurse)
    assert client.get(URL).json()["count"] == 2
    assert client.get(URL, {"mine": "true"}).json()["count"] == 1
    assert client.get(URL, {"status": Operation.Status.FINISHED}).json()["count"] == 1
    assert client.get(URL, {"search": "M-"}).json()["count"] == 0
    assert client.get(URL, {"search": "PID-1"}).json()["count"] == 2


def test_operation_cannot_be_deleted(client_for, head, make_operation):
    assert client_for(head).delete(f"{URL}{make_operation().id}/").status_code == 405


def test_cancel_operation(client_for, doctor, make_operation):
    op = make_operation(doctor=doctor)
    client = client_for(doctor)
    assert client.post(f"{URL}{op.id}/cancel/", {}).status_code == 400
    response = client.post(f"{URL}{op.id}/cancel/", {"reason_cancel": "Отказ пациента"})
    assert response.status_code == 200
    assert response.json()["status"] == Operation.Status.CANCELLED
    op.patient.refresh_from_db()
    assert op.patient.status == Patient.Status.ARCHIVE
    again = client.post(f"{URL}{op.id}/cancel/", {"reason_cancel": "Повтор"})
    assert again.status_code == 409


def test_cancel_after_anesthesia_start_is_conflict(client_for, head, make_operation):
    op = make_operation()
    AnestheticAction.objects.create(operation=op, time=aware(2026, 10, 1, 9, 10), value="ANESTHESIA_START")
    response = client_for(head).post(f"{URL}{op.id}/cancel/", {"reason_cancel": "x"})
    assert response.status_code == 409


def test_only_assigned_doctor_can_cancel(client_for, doctor, make_user, make_operation):
    op = make_operation(doctor=make_user(Role.DOCTOR))
    assert client_for(doctor).post(f"{URL}{op.id}/cancel/", {"reason_cancel": "x"}).status_code == 403


def test_finish_requires_anesthesia_stop(client_for, head, make_operation):
    op = make_operation()
    client = client_for(head)
    assert client.post(f"{URL}{op.id}/finish/").status_code == 409
    AnestheticAction.objects.create(operation=op, time=aware(2026, 10, 1, 9, 10), value="ANESTHESIA_START")
    AnestheticAction.objects.create(operation=op, time=aware(2026, 10, 1, 11, 0), value="ANESTHESIA_STOP")
    response = client.post(f"{URL}{op.id}/finish/")
    assert response.status_code == 200
    assert response.json()["status"] == Operation.Status.FINISHED
    assert response.json()["is_anesthesia_stopped"] is True
    op.patient.refresh_from_db()
    assert op.patient.status == Patient.Status.ARCHIVE


def test_detail_includes_patient_info(client_for, nurse, make_operation):
    op = make_operation()
    body = client_for(nurse).get(f"{URL}{op.id}/").json()
    assert body["patient_info"]["id"] == op.patient_id
    assert body["is_anesthesia_started"] is False
    assert body["type_operation_name"] == "Плановая"
