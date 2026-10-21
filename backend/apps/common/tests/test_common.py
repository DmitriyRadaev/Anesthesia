import pytest

from apps.medicaments.models import Medicament

pytestmark = pytest.mark.django_db


def test_health(anon_client):
    assert anon_client.get("/api/health/").json() == {"status": "ok", "database": "postgresql"}


def test_openapi_schema_and_swagger(anon_client):
    schema = anon_client.get("/api/schema/")
    assert schema.status_code == 200
    assert b"/api/operations/{operation_id}/card/actions/" in schema.content
    assert anon_client.get("/api/docs/").status_code == 200


def test_medicaments_loaded_and_searchable(client_for, nurse):
    assert Medicament.objects.count() > 100
    client = client_for(nurse)
    found = client.get("/api/medicaments/", {"search_name": "атроп"}).json()
    assert [m["name"] for m in found["results"]] == ["Атропин"]
    page = client.get("/api/medicaments/").json()
    assert len(page["results"]) == 20 and page["next"]


def test_unknown_route_returns_404(client_for, nurse):
    assert client_for(nurse).get("/api/nope/").status_code == 404


def test_method_not_allowed_format(client_for, head, make_operation):
    response = client_for(head).delete(f"/api/operations/{make_operation().id}/")
    assert response.status_code == 405
    assert set(response.json()) == {"detail", "code"}


def test_choice_list_filter_lenient_and_strict(client_for, head, make_patient):
    make_patient(status=1)
    make_patient(status=3)
    client = client_for(head)
    assert client.get("/api/patients/", {"status": ""}).json()["count"] == 2
    assert client.get("/api/patients/?status=1&status=3").json()["count"] == 2
    assert client.get("/api/patients/", {"status": "1,3"}).json()["count"] == 2
    assert client.get("/api/patients/", {"status": "3"}).json()["count"] == 1
    assert client.get("/api/patients/", {"status": "9"}).status_code == 400
