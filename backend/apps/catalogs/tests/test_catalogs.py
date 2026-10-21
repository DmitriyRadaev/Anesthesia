import pytest

from apps.accounts.models import Role
from apps.catalogs.models import Department, ScaleGlazgo, Sex, TypeOperation
from apps.catalogs.registry import CATALOGS

pytestmark = pytest.mark.django_db


def test_catalogs_loaded_by_migration():
    assert Sex.objects.count() == 2
    assert TypeOperation.objects.get(pk=TypeOperation.PLANNED).name == "Плановая"
    assert ScaleGlazgo.objects.count() == 15  # строки шкалы FOUR удалены из Глазго
    assert Department.objects.filter(department_type_id=1).count() == 4


def test_catalog_index_and_all_slugs(client_for, nurse):
    client = client_for(nurse)
    index = client.get("/api/catalogs/").json()
    assert {item["slug"] for item in index} == set(CATALOGS)
    for slug in CATALOGS:
        params = {"department_type_id": 1} if slug == "department" else {}
        response = client.get(f"/api/catalogs/{slug}/", params)
        assert response.status_code == 200, slug


def test_catalog_filters(client_for, admin_user, make_user):
    client = client_for(admin_user)  # справочники доступны любому авторизованному пользователю
    assert client.get("/api/catalogs/department/").status_code == 400
    assert {d["department_type"] for d in client.get("/api/catalogs/department/", {"department_type_id": 3}).json()} == {3}
    assert all(v["type"] == 1 for v in client.get("/api/catalogs/vein_pvc/").json())
    assert len(client.get("/api/catalogs/scale_glazgo/", {"head_id": 2}).json()) == 5
    assert {m["type"] for m in client.get("/api/catalogs/anesthesia_method/", {"type": "LOCAL"}).json()} == {"LOCAL"}
    assert client.get("/api/catalogs/department/", {"department_type_id": "abc"}).status_code == 400
    assert client.get("/api/catalogs/unknown/").status_code == 404


def test_doctor_fio_from_users(client_for, make_user):
    doctor = make_user(Role.DOCTOR, surname="Хирургов")
    make_user(Role.DOCTOR, surname="Уволенный", is_active=False)
    make_user(Role.NURSE)
    names = client_for(doctor).get("/api/catalogs/doctor_fio/").json()
    assert names == [{"id": doctor.id, "name": doctor.full_name}]


def test_catalogs_require_auth(anon_client):
    assert anon_client.get("/api/catalogs/sex/").status_code == 401
