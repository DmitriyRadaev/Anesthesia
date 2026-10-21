import pytest

pytestmark = pytest.mark.django_db


def url(op, suffix=""):
    return f"/api/operations/{op.id}/labs/{suffix}"


def test_schema(client_for, nurse, make_operation):
    schema = client_for(nurse).get(url(make_operation(), "schema/")).json()
    keys = [section["key"] for section in schema]
    assert keys[0] == "blood_general" and "urine" in keys
    hgb = schema[0]["fields"][0]
    assert hgb == {"code": "HGB", "label": "Гемоглобин", "unit": "г/л", "type": "number"}


def test_save_and_read_lab_values(client_for, nurse, make_operation):
    op = make_operation()
    client = client_for(nurse)
    assert client.get(url(op)).json() == {"values": {}, "updated_at": None, "updated_by_name": None}
    data = {"values": {"blood_general": {"HGB": "132,5", "HCT": ""}, "gas_arterial": {"BE": "-2.4"},
                       "urine": {"ket": "++", "color": "Соломенно-жёлтый"}}}
    response = client.put(url(op), data, format="json")
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["values"] == {"blood_general": {"HGB": 132.5}, "gas_arterial": {"BE": -2.4},
                              "urine": {"ket": "++", "color": "Соломенно-жёлтый"}}
    assert body["updated_by_name"] == nurse.full_name


def test_lab_validation(client_for, nurse, make_operation):
    op = make_operation()
    data = {"values": {"blood_general": {"HGB": "abc", "PLT": 1000, "XXX": 1}, "unknown": {}, "urine": {"ket": "+-"}}}
    response = client_for(nurse).put(url(op), data, format="json")
    assert response.status_code == 400
    errors = response.json()["errors"]
    assert {"blood_general.HGB", "blood_general.PLT", "blood_general.XXX", "unknown", "urine.ket"} <= set(errors)


def test_labs_forbidden_for_admin(client_for, admin_user, make_operation):
    assert client_for(admin_user).get(url(make_operation())).status_code == 403
