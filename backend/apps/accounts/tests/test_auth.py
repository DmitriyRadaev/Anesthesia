from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import AuthToken, Role
from conftest import TEST_PASSWORD

pytestmark = pytest.mark.django_db

LOGIN = "/api/auth/login/"


def test_login_success_returns_token_and_user(anon_client, doctor):
    response = anon_client.post(LOGIN, {"username": doctor.username, "password": TEST_PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["token"] and body["expires_at"]
    assert body["user"]["id"] == doctor.id
    assert body["user"]["role"] == Role.DOCTOR
    assert "password" not in body["user"]
    # в БД хранится только хеш ключа
    assert not AuthToken.objects.filter(key_hash=body["token"]).exists()
    assert AuthToken.objects.filter(user=doctor).count() == 1


def test_login_wrong_password(anon_client, doctor):
    response = anon_client.post(LOGIN, {"username": doctor.username, "password": "wrong-password"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Неверный логин или пароль."


def test_login_unknown_user(anon_client):
    assert anon_client.post(LOGIN, {"username": "ghost", "password": "x"}).status_code == 401


def test_login_inactive_user_forbidden(anon_client, make_user):
    user = make_user(is_active=False)
    response = anon_client.post(LOGIN, {"username": user.username, "password": TEST_PASSWORD})
    assert response.status_code == 403
    assert "деактивирована" in response.json()["detail"]


def test_login_validation_error_format(anon_client):
    response = anon_client.post(LOGIN, {"username": ""})
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid"
    assert set(body["errors"]) == {"username", "password"}


def test_protected_endpoint_requires_auth(anon_client):
    response = anon_client.get("/api/auth/me/")
    assert response.status_code == 401
    assert response.json()["detail"]


def test_invalid_token_rejected(anon_client):
    anon_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
    assert anon_client.get("/api/auth/me/").status_code == 401


def test_me_returns_current_user(client_for, nurse):
    response = client_for(nurse).get("/api/auth/me/")
    assert response.status_code == 200
    assert response.json()["username"] == nurse.username
    assert response.json()["role_display"] == "Медсестра/Медбрат"


def test_expired_token_is_rejected_and_deleted(anon_client, doctor):
    token, key = AuthToken.objects.issue(doctor)
    AuthToken.objects.filter(pk=token.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
    anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {key}")
    response = anon_client.get("/api/auth/me/")
    assert response.status_code == 401
    assert "истёк" in response.json()["detail"]
    assert not AuthToken.objects.filter(pk=token.pk).exists()


def test_token_of_deactivated_user_rejected(client_for, doctor):
    client = client_for(doctor)
    doctor.is_active = False
    doctor.save()
    assert client.get("/api/auth/me/").status_code == 401


def test_logout_revokes_only_current_token(anon_client, doctor):
    _, key1 = AuthToken.objects.issue(doctor)
    _, key2 = AuthToken.objects.issue(doctor)
    anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {key1}")
    assert anon_client.post("/api/auth/logout/").status_code == 204
    assert anon_client.get("/api/auth/me/").status_code == 401
    anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {key2}")
    assert anon_client.get("/api/auth/me/").status_code == 200


def test_change_password(client_for, anon_client, doctor):
    client = client_for(doctor)
    _, other_key = AuthToken.objects.issue(doctor)

    wrong = client.post("/api/auth/change-password/", {"old_password": "nope", "password": "N3w-Secure-Pass"})
    assert wrong.status_code == 400
    assert "old_password" in wrong.json()["errors"]

    weak = client.post("/api/auth/change-password/", {"old_password": TEST_PASSWORD, "password": "123"})
    assert weak.status_code == 400

    ok = client.post("/api/auth/change-password/", {"old_password": TEST_PASSWORD, "password": "N3w-Secure-Pass"})
    assert ok.status_code == 204
    doctor.refresh_from_db()
    assert doctor.check_password("N3w-Secure-Pass")
    # текущая сессия жива, остальные завершены
    assert client.get("/api/auth/me/").status_code == 200
    anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {other_key}")
    assert anon_client.get("/api/auth/me/").status_code == 401


def test_passwords_are_hashed(doctor):
    assert doctor.password != TEST_PASSWORD
    assert doctor.check_password(TEST_PASSWORD)
