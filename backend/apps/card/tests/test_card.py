from datetime import datetime
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.card.models import DrugAdministration
from apps.card.services import summarize_doses
from apps.catalogs.models import MeasurementUnit
from apps.monitoring.models import HL7Result
from apps.operations.models import Operation
from apps.patients.models import Patient

pytestmark = pytest.mark.django_db


def iso(*args) -> str:
    return timezone.make_aware(datetime(*args)).isoformat()


def card_url(op, block):
    return f"/api/operations/{op.id}/card/{block}/"


def test_card_requires_clinical_role(client_for, admin_user, make_operation):
    op = make_operation()
    assert client_for(admin_user).get(card_url(op, "actions")).status_code == 403


def test_unknown_operation_404(client_for, nurse):
    assert client_for(nurse).get("/api/operations/999999/card/actions/").status_code == 404


def test_actions_update_operation_status(client_for, nurse, make_operation):
    op = make_operation()
    op.patient.status = Patient.Status.NEW
    op.patient.save()
    client = client_for(nurse)
    response = client.put(card_url(op, "actions"), [
        {"time": iso(2026, 10, 1, 9, 5), "value": "ANESTHESIA_START"},
        {"time": iso(2026, 10, 1, 9, 10), "value": "INTUBATION"},
    ], format="json")
    assert response.status_code == 200, response.json()
    assert [a["value"] for a in response.json()] == ["ANESTHESIA_START", "INTUBATION"]
    op.refresh_from_db()
    assert op.status == Operation.Status.ON_OPERATION
    assert op.patient.status == Patient.Status.ACTIVE

    # удаление «Начала анестезии» возвращает статус ПОСТУПИЛ
    client.put(card_url(op, "actions"), [{"time": iso(2026, 10, 1, 9, 10), "value": "INTUBATION"}], format="json")
    op.refresh_from_db()
    assert op.status == Operation.Status.ARRIVED


def test_actions_do_not_revive_cancelled_case(client_for, nurse, make_operation):
    op = make_operation(status=Operation.Status.CANCELLED)
    client_for(nurse).put(card_url(op, "actions"), [{"time": iso(2026, 10, 1, 9, 5), "value": "ANESTHESIA_START"}],
                          format="json")
    op.refresh_from_db()
    assert op.status == Operation.Status.CANCELLED


def test_actions_validation(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    twice = client.put(card_url(op, "actions"), [
        {"time": iso(2026, 10, 1, 9, 5), "value": "ANESTHESIA_START"},
        {"time": iso(2026, 10, 1, 9, 6), "value": "ANESTHESIA_START"},
    ], format="json")
    assert twice.status_code == 400
    stop_before_start = client.put(card_url(op, "actions"), [
        {"time": iso(2026, 10, 1, 9, 5), "value": "ANESTHESIA_START"},
        {"time": iso(2026, 10, 1, 9, 0), "value": "ANESTHESIA_STOP"},
    ], format="json")
    assert stop_before_start.status_code == 400
    unknown = client.put(card_url(op, "actions"), [{"time": iso(2026, 10, 1, 9, 5), "value": "DANCE"}], format="json")
    assert unknown.status_code == 400
    not_a_list = client.put(card_url(op, "actions"), {"time": iso(2026, 10, 1, 9, 5)}, format="json")
    assert not_a_list.status_code == 400


def test_breath_characteristics_roundtrip_and_overlap(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    empty = client.get(card_url(op, "breath")).json()
    assert empty == {"spontaneous": [], "supportive": [], "forced": []}

    data = {"spontaneous": [{"time_start": iso(2026, 10, 1, 9, 0), "time_end": iso(2026, 10, 1, 9, 15)}],
            "forced": [{"time_start": iso(2026, 10, 1, 9, 20), "time_end": iso(2026, 10, 1, 10, 0)}]}
    response = client.put(card_url(op, "breath"), data, format="json")
    assert response.status_code == 200
    assert len(response.json()["forced"]) == 1 and response.json()["supportive"] == []

    overlap = {"forced": [
        {"time_start": iso(2026, 10, 1, 9, 0), "time_end": iso(2026, 10, 1, 9, 30)},
        {"time_start": iso(2026, 10, 1, 9, 30), "time_end": iso(2026, 10, 1, 9, 40)},
    ]}
    assert client.put(card_url(op, "breath"), overlap, format="json").status_code == 400
    reversed_interval = {"forced": [{"time_start": iso(2026, 10, 1, 10, 0), "time_end": iso(2026, 10, 1, 9, 0)}]}
    assert client.put(card_url(op, "breath"), reversed_interval, format="json").status_code == 400


def test_stages_auto_created_and_updated(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    stages = client.get(card_url(op, "stages")).json()
    assert [s["stage"] for s in stages] == [1, 2, 3, 4, 5, 6]
    response = client.put(card_url(op, "stages"), [
        {"stage": 1, "time_start": iso(2026, 10, 1, 9, 30), "description": "Разрез"},
        {"stage": 6, "time_start": iso(2026, 10, 1, 11, 0), "description": "Ушивание"},
    ], format="json")
    assert response.status_code == 200
    by_stage = {s["stage"]: s for s in response.json()}
    assert by_stage[1]["description"] == "Разрез" and by_stage[2]["time_start"] is None
    assert client.put(card_url(op, "stages"), [{"stage": 7}], format="json").status_code == 400


def test_drugs_grouped_roundtrip(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    data = [{"drug": "Пропофол", "items": [
        {"injection_type": "BOLUS", "measurement_unit": 1, "dose": "150,5", "time_start": iso(2026, 10, 1, 9, 10),
         "time_end": iso(2026, 10, 1, 9, 30)},
        {"injection_type": "INFUSION", "measurement_unit": 2, "dose": "200", "time_start": iso(2026, 10, 1, 9, 40)},
    ]}, {"drug": "Фентанил", "items": [
        {"injection_type": "BOLUS", "measurement_unit": 2, "dose": 100, "time_start": iso(2026, 10, 1, 9, 12)},
    ]}]
    response = client.put(card_url(op, "drugs/introduction"), data, format="json")
    assert response.status_code == 200, response.json()
    body = response.json()
    assert [g["drug"] for g in body] == ["Пропофол", "Фентанил"]
    assert body[0]["items"][0]["dose"] == "150.5"
    assert body[1]["items"][0]["dose"] == "100"  # без экспоненциальной записи (1E+2)
    assert body[0]["items"][0]["time_end"] is None  # у болюса нет окончания
    assert DrugAdministration.objects.filter(operation=op, section="introduction").count() == 3
    # разделы независимы
    assert client.get(card_url(op, "drugs/premedication")).json() == []


def test_drugs_validation(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    overlap = [{"drug": "Пропофол", "items": [
        {"injection_type": "INFUSION", "measurement_unit": 1, "dose": "1", "time_start": iso(2026, 10, 1, 9, 0)},
        {"injection_type": "BOLUS", "measurement_unit": 1, "dose": "1", "time_start": iso(2026, 10, 1, 10, 0)},
    ]}]
    assert client.put(card_url(op, "drugs/maintenance"), overlap, format="json").status_code == 400
    bad = [{"drug": "", "items": [{"injection_type": "X", "measurement_unit": 999, "dose": "-1"}]}]
    response = client.put(card_url(op, "drugs/maintenance"), bad, format="json")
    assert response.status_code == 400
    assert client.get(card_url(op, "drugs/unknown")).status_code == 404


def test_infusions_transfusions_liquids(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    infusions = [{"solution": "NaCl 0,9%", "items": [{"dose": "500", "time_start": iso(2026, 10, 1, 9, 0),
                                                        "time_end": iso(2026, 10, 1, 10, 0)}]}]
    assert client.put(card_url(op, "infusions"), infusions, format="json").json()[0]["items"][0]["dose"] == "500.00"
    transfusions = [{"solution": "Эритроцитарная масса", "items": [{"gemakon": "№123 250 мл",
                                                                    "time_start": iso(2026, 10, 1, 9, 30)}]}]
    assert client.put(card_url(op, "transfusions"), transfusions, format="json").status_code == 200
    liquids = [{"liquid": "Кровопотеря", "items": [{"volume": "300", "time_start": iso(2026, 10, 1, 10, 0)}]}]
    assert client.put(card_url(op, "liquids"), liquids, format="json").status_code == 200
    assert client.get(card_url(op, "liquids")).json()[0]["liquid"] == "Кровопотеря"
    assert client.put(card_url(op, "liquids"), [{"liquid": "X", "items": []}], format="json").status_code == 400


def test_patient_info_and_pid_datetime(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    info = client.get(card_url(op, "patient-info")).json()
    assert info["surname"] == op.patient.surname
    response = client.patch(card_url(op, "patient-info"), {"asa": 2, "department": 1, "height": 180, "weight": 81})
    assert response.status_code == 200 and response.json()["asa"] == 2
    wrong_department = client.patch(card_url(op, "patient-info"), {"department": 5})
    assert wrong_department.status_code == 400
    response = client.patch(card_url(op, "pid-datetime"), {"pid": "NEW-PID", "operation_date": "2026-10-02",
                                                           "operation_time": "07:45"})
    assert response.status_code == 200
    op.refresh_from_db()
    assert op.pid == "NEW-PID" and str(op.operation_time) == "07:45:00"
    # «Очистить все» в карте сбрасывает дату и время поступления
    response = client.patch(card_url(op, "pid-datetime"), {"operation_date": None, "operation_time": None}, format="json")
    assert response.status_code == 200
    op.refresh_from_db()
    assert op.operation_date is None and op.operation_time is None


def test_summarize_doses_unit_conversion(make_operation):
    op = make_operation()
    mg, mcg, ml = (MeasurementUnit.objects.get(pk=i) for i in (1, 2, 3))
    rows = [
        DrugAdministration(operation=op, section="introduction", drug="Фентанил", injection_type="BOLUS",
                           measurement_unit=mcg, dose=Decimal("100")),
        DrugAdministration(operation=op, section="maintenance", drug="Фентанил", injection_type="BOLUS",
                           measurement_unit=mg, dose=Decimal("0.05")),
        DrugAdministration(operation=op, section="maintenance", drug="Лидокаин", injection_type="BOLUS",
                           measurement_unit=ml, dose=Decimal("2")),
    ]
    totals = summarize_doses(rows)
    assert totals[0] == {"drug": "Фентанил", "dose": 0.15, "unit": "mg", "text": "Фентанил 0.15 mg"}
    assert totals[1]["unit"] == "ml" and totals[1]["dose"] == 2.0


def _hl7(op, minute, **values):
    observations = [{"observation_name": name, "observation_value": str(v), "observation_number": "", "unit": ""}
                    for name, v in values.items()]
    return HL7Result.objects.create(observation_at=timezone.make_aware(datetime(2026, 10, 1, 9, minute)),
                                    pid=op.pid, order_number=str(minute), observations=observations)


def test_cms_buckets_take_latest_value(client_for, nurse, make_operation):
    op = make_operation()  # поступление 09:00 → окно с 08:55
    from apps.card.models import AnestheticAction

    AnestheticAction.objects.create(operation=op, value="ANESTHESIA_START", time=timezone.make_aware(datetime(2026, 10, 1, 9, 1)))
    AnestheticAction.objects.create(operation=op, value="ANESTHESIA_STOP", time=timezone.make_aware(datetime(2026, 10, 1, 9, 20)))
    _hl7(op, 1, MDC_PULS_OXIM_SAT_O2=97, MDC_CONC_AWAY_O2_INSP=40)
    _hl7(op, 3, MDC_PULS_OXIM_SAT_O2=98, MDC_PRESS_BLD_NONINV_SYS=120, MDC_PRESS_BLD_NONINV_DIA=80)
    _hl7(op, 12, MDC_ECG_HEART_RATE=72)
    body = client_for(nurse).get(card_url(op, "cms")).json()
    values = list(body["data"].values())
    assert len(values) == 5  # 08:55–09:20 по 5 минут
    first_bucket = values[1]  # 09:00–09:05
    assert first_bucket["SpO2"] == "98"
    assert first_bucket["PRESS_BLD_NONINV"] == {"SYS": "120", "MEAN": None, "DIA": "80"}
    assert values[0]["SpO2"] is None
    assert values[2]["HEART_RATE"] is None
    assert values[3]["HEART_RATE"] == "72"  # 09:10–09:15


def test_print_data(client_for, nurse, make_operation):
    op = make_operation()
    DrugAdministration.objects.create(operation=op, section="premedication", drug="Атропин", injection_type="BOLUS",
                                      measurement_unit_id=1, dose=Decimal("0.5"),
                                      time_start=timezone.make_aware(datetime(2026, 10, 1, 9, 5)))
    body = client_for(nurse).get(card_url(op, "print")).json()
    assert body["general"]["surname"] == op.patient.surname
    assert body["premedication"][0]["text"] == "Атропин 0.5 mg"
    assert body["general"]["age"] == 46
