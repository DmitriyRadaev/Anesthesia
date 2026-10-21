from datetime import datetime

import pytest
from django.utils import timezone

from apps.card.models import AnestheticAction, OperationStage
from apps.protocol.services import describe_anesthesia

pytestmark = pytest.mark.django_db


def url(op, block):
    return f"/api/operations/{op.id}/protocol/{block}/"


def aware(*args):
    return timezone.make_aware(datetime(*args))


def test_patient_info(client_for, doctor, make_operation):
    op = make_operation(height=180, weight=81)
    client = client_for(doctor)
    body = client.get(url(op, "patient-info")).json()
    assert body["bmi"] == 25.0 and body["surname"] == op.patient.surname
    response = client.patch(url(op, "patient-info"), {"complaints_patient": "Боль", "operation_name": "Нельзя"})
    assert response.status_code == 200
    assert response.json()["complaints_patient"] == "Боль"
    assert response.json()["operation_name"] == op.operation_name  # только чтение


def test_information_anesthesia(client_for, doctor, make_operation):
    op = make_operation()
    AnestheticAction.objects.create(operation=op, value="ANESTHESIA_START", time=aware(2026, 10, 1, 9, 7))
    client = client_for(doctor)
    empty = client.get(url(op, "information-anesthesia")).json()
    assert empty["anesthesia_methods"] == [] and empty["anesthesia_types"] == {"GENERAL": [], "LOCAL": []}
    assert empty["time_anesthesia_start"].startswith("2026-10-01T09:07")
    response = client.put(url(op, "information-anesthesia"), {"anesthesia_methods": [1, 7], "patient_arrived": True},
                          format="json")
    assert response.status_code == 200, response.json()
    types = response.json()["anesthesia_types"]
    assert [m["name"] for m in types["GENERAL"]] == ["Ингаляционная"]
    assert [m["name"] for m in types["LOCAL"]] == ["Эпидуральная"]
    assert client.put(url(op, "information-anesthesia"), {"anesthesia_methods": [999]}, format="json").status_code == 400


def test_venous_access_kinds(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    pvc = [{"vein": 1, "arm": "L", "catheter_diameter_1": 4}, {"vein": 3, "arm": "R"}]
    assert client.put(url(op, "venous-access/pvc"), pvc, format="json").status_code == 200
    cvc = [{"vein": 4, "arm": "R", "catheter_type": 2, "catheter_diameter_1": 2, "catheter_diameter_2": 3}]
    assert client.put(url(op, "venous-access/cvc"), cvc, format="json").status_code == 200
    assert len(client.get(url(op, "venous-access/pvc")).json()) == 2
    assert len(client.get(url(op, "venous-access/cvc")).json()) == 1
    wrong_kind = client.put(url(op, "venous-access/cvc"), [{"vein": 1, "arm": "L"}], format="json")
    assert wrong_kind.status_code == 400
    assert client.put(url(op, "venous-access/pvc"), [{"vein": 1, "arm": "X"}], format="json").status_code == 400


def test_singleton_blocks(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    assert client.get(url(op, "premedication")).json()["rass"] is None
    assert client.patch(url(op, "premedication"), {"rass": 5, "pharynx_tamponade": True}).status_code == 200
    assert client.patch(url(op, "premedication"), {"note": "Без особенностей"}).json()["rass"] == 5
    assert client.put(url(op, "ventilator"), {"ventilator": 1, "monitoring": 2, "note": "Примечание"}).status_code == 200
    assert client.patch(url(op, "maintaining-anesthesia"), {"index_bis": 150}).status_code == 400
    assert client.patch(url(op, "maintaining-anesthesia"), {"index_bis": 45, "anesthesia_type": 1}).status_code == 200


def test_unique_tube_and_mask_types(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    tubes = [{"tube_type": 1, "combi_tube_size": 1}, {"tube_type": 2, "option": "WITH", "intubation_tube_size": 3}]
    assert client.put(url(op, "tube-installations"), tubes, format="json").status_code == 200
    assert client.put(url(op, "tube-installations"), [{"tube_type": 1}, {"tube_type": 1}], format="json").status_code == 400
    masks = [{"laryngeal_mask_type": 3, "option": "RG", "oropharyngeal_catheter": 1}]
    assert client.put(url(op, "laryngeal-masks"), masks, format="json").status_code == 200


def test_airway_structure_validation(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    data = {
        "tube_installed": True, "attempts": 1, "intubation_method": "INTUBOSCOPY",
        "laryngeal_tube": {"is_installed": True, "size_id": 1},
        "intubation_tube": {"type": "OROTRACHEAL", "cuff": True, "size_id": 2},
        "endobronchial_tube": {"type": "L", "size_id": 3},
        "laryngoscopy": {"type": "DL", "blade_type_id": 1},
        "sanacia": [{"type": "TBD", "catheter": "12"}, {"type": "FBS", "comment": "Без патологии"}],
    }
    response = client.put(url(op, "airway"), data, format="json")
    assert response.status_code == 200, response.json()
    assert response.json()["intubation_tube"]["type"] == "OROTRACHEAL"
    bad = {**data, "intubation_method": "MAGIC", "endobronchial_tube": {"type": "X"},
           "sanacia": [{"type": "TBD"}, {"type": "TBD"}]}
    errors = client.put(url(op, "airway"), bad, format="json").json()["errors"]
    assert {"intubation_method", "endobronchial_tube", "sanacia"} <= set(errors)
    empty = client.get(f"/api/operations/{op.id}/protocol/airway/").json()
    assert empty["laryngoscopy"]["type"] == "DL"


def test_redirecting_patient_department_type(client_for, doctor, make_operation):
    op = make_operation()
    client = client_for(doctor)
    ok = client.put(url(op, "redirecting-patient"), {"department_type": 1, "department": 1, "doctor_fio": "Иванов И.И."})
    assert ok.status_code == 200
    mismatch = client.patch(url(op, "redirecting-patient"), {"department_type": 3})
    assert mismatch.status_code == 400 and "department" in mismatch.json()["errors"]


def test_patient_transferred_and_duration(client_for, doctor, make_operation):
    op = make_operation()
    OperationStage.objects.create(operation=op, stage=1, time_start=aware(2026, 10, 1, 9, 30))
    OperationStage.objects.create(operation=op, stage=6, time_start=aware(2026, 10, 1, 11, 5))
    client = client_for(doctor)
    assert client.get(url(op, "patient-transferred")).json()["operation_duration"] == "01:35"
    data = {"b_time": "11:10", "b_ad": 120, "b_spo2": 98, "b_scale_glazgo": {"1": 4, "2": 5, "3": 6},
            "is_extubation": True, "extubation": 10, "is_died": False}
    response = client.patch(url(op, "patient-transferred"), data, format="json")
    assert response.status_code == 200, response.json()
    assert response.json()["b_scale_glazgo"] == {"1": 4, "2": 5, "3": 6}
    assert client.patch(url(op, "patient-transferred"), {"b_spo2": 150}, format="json").status_code == 400
    assert client.patch(url(op, "patient-transferred"), {"t_scale_meyo": [1, 2]}, format="json").status_code == 400


@pytest.mark.parametrize("general,local,expected", [
    (["Ингаляционная"], [], "Общая: Ингаляционная"),
    (["Ингаляционная", "Неингаляционная"], [], "Выбрана комбинированная анестезия. Общая: Ингаляционная, Неингаляционная"),
    (["Ингаляционная"], ["Эпидуральная"], "Выбрана сочетанная анестезия. Местная: Эпидуральная; Общая: Ингаляционная"),
    ([], ["Аппликационная", "Инфильтрационная"], "Выбрана комбинированная анестезия. Местная: Аппликационная, Инфильтрационная"),
    ([], ["Проводниковая", "Плексусная", "Каудальная", "Спинальная (субарахноидальная)", "Эпидуральная"],
     "Выбрана регионарная анестезия. Местная: Проводниковая, Плексусная, Каудальная, Спинальная (субарахноидальная), Эпидуральная"),
])
def test_describe_anesthesia(general, local, expected):
    assert describe_anesthesia(general, local) == expected


def test_protocol_print(client_for, doctor, make_operation):
    op = make_operation(doctor=doctor)
    client = client_for(doctor)
    client.put(url(op, "information-anesthesia"), {"anesthesia_methods": [1], "patient_arrived": True}, format="json")
    client.patch(url(op, "patient-transferred"), {"is_decurarisation": True, "atropine": 0.5}, format="json")
    client.put(url(op, "redirecting-patient"), {"department_type": 3, "department": 9, "doctor_fio": ""})
    body = client.get(url(op, "print")).json()
    assert body["anesthesia_types"] == "Общая: Ингаляционная"
    assert body["patient_arrived"].endswith("- Да")
    assert body["is_decurarisation"] == "Да" and body["atropine"] == 0.5
    assert body["transferred_to"].startswith(" - , ")
    assert body["doctor"] == doctor.full_name
