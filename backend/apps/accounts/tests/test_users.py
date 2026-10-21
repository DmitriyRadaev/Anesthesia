import io

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import AuthToken, Role, User

pytestmark = pytest.mark.django_db

USERS = "/api/users/"
NEW_USER = {
    "username": "new.doctor",
    "password": "V3ry-Secure-Pass",
    "surname": "Новиков",
    "firstname": "Николай",
    "lastname": "Николаевич",
    "role": Role.DOCTOR,
}


@pytest.mark.parametrize("role", [Role.ADMIN, Role.HEAD, Role.ACTING_HEAD])
def test_managers_can_list_users(client_for, make_user, role):
    manager = make_user(role)
    make_user(Role.NURSE)
    response = client_for(manager).get(USERS)
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert {"count", "next", "previous", "results"} <= set(body)


@pytest.mark.parametrize("role", [Role.DOCTOR, Role.NURSE])
def test_regular_users_cannot_manage_users(client_for, make_user, role):
    user = make_user(role)
    other = make_user(Role.NURSE)
    client = client_for(user)
    assert client.get(USERS).status_code == 403
    assert client.post(USERS, NEW_USER).status_code == 403
    assert client.patch(f"{USERS}{other.id}/", {"is_active": False}).status_code == 403
    assert client.patch(f"{USERS}{user.id}/", {"role": Role.ADMIN}).status_code == 403
    assert client.post(f"{USERS}{other.id}/set-password/", {"password": "Another-Pass-123"}).status_code == 403


def test_admin_creates_user_with_hashed_password(client_for, admin_user, anon_client):
    response = client_for(admin_user).post(USERS, NEW_USER)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["username"] == "new.doctor" and body["is_active"] is True
    assert "password" not in body
    created = User.objects.get(username="new.doctor")
    assert created.password != NEW_USER["password"]
    login = anon_client.post("/api/auth/login/", {"username": "new.doctor", "password": NEW_USER["password"]})
    assert login.status_code == 200


def test_create_user_validation(client_for, admin_user, doctor):
    client = client_for(admin_user)
    duplicate = client.post(USERS, {**NEW_USER, "username": doctor.username})
    assert duplicate.status_code == 400 and "username" in duplicate.json()["errors"]
    weak = client.post(USERS, {**NEW_USER, "password": "12345678"})
    assert weak.status_code == 400 and "password" in weak.json()["errors"]
    bad_name = client.post(USERS, {**NEW_USER, "surname": "Ivan0v"})
    assert bad_name.status_code == 400 and "surname" in bad_name.json()["errors"]
    bad_role = client.post(USERS, {**NEW_USER, "role": 99})
    assert bad_role.status_code == 400


def test_user_list_search_filter_ordering(client_for, admin_user, make_user):
    make_user(Role.DOCTOR, surname="Абрамов")
    make_user(Role.NURSE, surname="Яковлева", is_active=False)
    client = client_for(admin_user)
    assert [u["surname"] for u in client.get(USERS, {"search": "Абрам"}).json()["results"]] == ["Абрамов"]
    nurses = client.get(USERS, {"role": Role.NURSE}).json()["results"]
    assert [u["surname"] for u in nurses] == ["Яковлева"]
    inactive = client.get(USERS, {"is_active": "false"}).json()["results"]
    assert [u["surname"] for u in inactive] == ["Яковлева"]
    ordered = client.get(USERS, {"ordering": "-surname"}).json()["results"]
    assert ordered[0]["surname"] == "Яковлева"


def test_deactivate_and_reactivate_user(client_for, admin_user, doctor, anon_client):
    _, key = AuthToken.objects.issue(doctor)
    client = client_for(admin_user)
    response = client.patch(f"{USERS}{doctor.id}/", {"is_active": False})
    assert response.status_code == 200 and response.json()["is_active"] is False
    assert not AuthToken.objects.filter(user=doctor).exists()  # сессии завершены
    anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {key}")
    assert anon_client.get("/api/auth/me/").status_code == 401
    assert client.patch(f"{USERS}{doctor.id}/", {"is_active": True}).json()["is_active"] is True


def test_assign_role(client_for, admin_user, doctor):
    response = client_for(admin_user).patch(f"{USERS}{doctor.id}/", {"role": Role.HEAD})
    assert response.status_code == 200
    assert response.json()["role"] == Role.HEAD


def test_acting_head_cannot_assign_privileged_roles(client_for, acting_head, doctor, head):
    client = client_for(acting_head)
    assert client.patch(f"{USERS}{doctor.id}/", {"role": Role.HEAD}).status_code == 403
    assert client.post(USERS, {**NEW_USER, "role": Role.ADMIN}).status_code == 403
    assert client.patch(f"{USERS}{head.id}/", {"is_active": False}).status_code == 403
    # обычные роли — можно
    assert client.patch(f"{USERS}{doctor.id}/", {"role": Role.NURSE}).status_code == 200


def test_manager_cannot_lock_themselves_out(client_for, admin_user):
    client = client_for(admin_user)
    assert client.patch(f"{USERS}{admin_user.id}/", {"is_active": False}).status_code == 403
    assert client.patch(f"{USERS}{admin_user.id}/", {"role": Role.DOCTOR}).status_code == 403
    # профиль менять можно
    assert client.patch(f"{USERS}{admin_user.id}/", {"job_title": "Системный администратор"}).status_code == 200


def test_set_password_revokes_sessions(client_for, admin_user, doctor):
    AuthToken.objects.issue(doctor)
    response = client_for(admin_user).post(f"{USERS}{doctor.id}/set-password/", {"password": "Fresh-Pass-2026"})
    assert response.status_code == 204
    doctor.refresh_from_db()
    assert doctor.check_password("Fresh-Pass-2026")
    assert not AuthToken.objects.filter(user=doctor).exists()


def test_user_cannot_be_deleted(client_for, admin_user, doctor):
    assert client_for(admin_user).delete(f"{USERS}{doctor.id}/").status_code == 405


def test_roles_catalog(client_for, nurse):
    response = client_for(nurse).get(f"{USERS}roles/")
    assert response.status_code == 200
    assert {"id": Role.HEAD, "name": "Заведующий отделением"} in response.json()


def test_medical_staff_lists_active_doctors_and_nurses(client_for, doctor, nurse, make_user, admin_user):
    make_user(Role.DOCTOR, surname="Уволенный", is_active=False)
    body = client_for(nurse).get(f"{USERS}medical-staff/").json()
    assert [d["id"] for d in body["doctors"]] == [doctor.id]
    assert [n["id"] for n in body["nurses"]] == [nurse.id]
    assert client_for(admin_user).get(f"{USERS}medical-staff/").status_code == 403


def test_create_admin_command(monkeypatch):
    monkeypatch.setenv("TEST_ADMIN_PASSWORD", "Admin-Secure-2026")
    out = io.StringIO()
    call_command("create_admin", "--username", "root", "--password-env", "TEST_ADMIN_PASSWORD", stdout=out)
    admin = User.objects.get(username="root")
    assert admin.role == Role.ADMIN and admin.check_password("Admin-Secure-2026")
    # повторный запуск с --if-missing не падает
    call_command("create_admin", "--username", "root", "--password-env", "TEST_ADMIN_PASSWORD", "--if-missing",
                 stdout=out)
    with pytest.raises(CommandError):
        call_command("create_admin", "--username", "root", "--password-env", "TEST_ADMIN_PASSWORD", stdout=out)


def test_create_admin_rejects_weak_password(monkeypatch):
    monkeypatch.setenv("WEAK_PASSWORD", "123")
    with pytest.raises(CommandError):
        call_command("create_admin", "--username", "weak", "--password-env", "WEAK_PASSWORD", stdout=io.StringIO())


def test_load_users_command(tmp_path):
    path = tmp_path / "users.json"
    path.write_text(
        '[{"username": "doc1", "role": "doctor", "surname": "Первый", "firstname": "Врач"},'
        ' {"username": "nurse1", "role": "nurse", "surname": "Первая", "firstname": "Сестра", "password": "Nurse-Pass-2026"}]',
        encoding="utf-8",
    )
    out = io.StringIO()
    call_command("load_users", str(path), stdout=out)
    assert User.objects.get(username="doc1").role == Role.DOCTOR
    assert User.objects.get(username="nurse1").check_password("Nurse-Pass-2026")
    assert "doc1:" in out.getvalue()  # сгенерированный пароль показан однократно
    assert "nurse1:" not in out.getvalue()
