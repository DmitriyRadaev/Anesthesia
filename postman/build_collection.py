"""Сборка Postman-коллекции с реальными примерами ответов.

Скрипт выполняет все запросы коллекции против работающего API (сценарий: вход → пользователи → пациент →
операционный случай → протокол → наркозная карта → ...), сохраняет фактические ответы как примеры и
пишет `anesthesia.postman_collection.json`. Токены в примерах маскируются.

Запуск (нужны клинический пользователь с ролью «Заведующий» и администратор):
    API_URL=http://localhost:8000 HEAD_USERNAME=head HEAD_PASSWORD=... \
    ADMIN_USERNAME=admin ADMIN_PASSWORD=... python postman/build_collection.py
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

BASE = os.environ.get("API_URL", "http://localhost:8000").rstrip("/")
OUT = Path(__file__).with_name("anesthesia.postman_collection.json")
state: dict = {}


def call(method: str, path: str, body=None, token: str | None = None, headers: dict | None = None):
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Accept", "application/json")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request) as response:
            status, raw, ctype = response.status, response.read(), response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        status, raw, ctype = error.code, error.read(), error.headers.get("Content-Type", "")
    if "json" in ctype and raw:
        return status, json.loads(raw)
    return status, ("<binary: %d bytes, %s>" % (len(raw), ctype)) if raw else None


def mask(value):
    if isinstance(value, dict):
        return {k: ("<token>" if k == "token" else mask(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v) for v in value[:5]]  # примеры списков укорачиваются
    return value


def item(name, method, path, body=None, *, auth="token", description="", tests=None, query=None, expect=None,
         headers=None, run=True):
    """Описание запроса Postman + выполнение для получения примера ответа."""
    token = state.get("adminToken") if auth == "adminToken" else state.get("token") if auth == "token" else None
    real_path = path
    for key, value in state.items():
        real_path = real_path.replace("{{%s}}" % key, str(value))
    qs = ""
    if query:
        qs = "?" + "&".join(f"{k}={v}" for k, v in query.items())
    real_qs = ""
    if query:
        resolved = {k: str(v) for k, v in query.items()}
        for key, value in state.items():
            resolved = {k: v.replace("{{%s}}" % key, str(value)) for k, v in resolved.items()}
        real_qs = "?" + urllib.parse.urlencode(resolved)
    real_headers = {k: v.replace("{{integrationApiKey}}", state.get("integrationApiKey", "")) for k, v in (headers or {}).items()}

    status, response = (None, None)
    if run:
        status, response = call(method, real_path + real_qs, body, token, real_headers)
        if expect is not None and status != expect:
            print(f"!! {method} {real_path}{real_qs}: ожидался {expect}, получен {status}: {response}", file=sys.stderr)
            sys.exit(1)

    url = {"raw": "{{baseUrl}}" + path + qs, "host": ["{{baseUrl}}"], "path": [p for p in path.strip("/").split("/")]}
    if query:
        url["query"] = [{"key": k, "value": str(v)} for k, v in query.items()]
    request = {"method": method, "header": [{"key": k, "value": v} for k, v in (headers or {}).items()], "url": url,
               "description": description}
    if body is not None:
        request["body"] = {"mode": "raw", "raw": json.dumps(body, ensure_ascii=False, indent=2),
                           "options": {"raw": {"language": "json"}}}
    if auth == "none":
        request["auth"] = {"type": "noauth"}
    elif auth == "adminToken":
        request["auth"] = {"type": "bearer", "bearer": [{"key": "token", "value": "{{adminToken}}", "type": "string"}]}
    entry = {"name": name, "request": request, "event": []}
    if tests:
        entry["event"].append({"listen": "test", "script": {"type": "text/javascript", "exec": tests}})
    if status is not None:
        entry["response"] = [{
            "name": f"{status}", "originalRequest": request, "code": status, "status": str(status),
            "_postman_previewlanguage": "json", "header": [{"key": "Content-Type", "value": "application/json"}],
            "body": json.dumps(mask(response), ensure_ascii=False, indent=2) if not isinstance(response, str) else response,
        }]
    return entry, status, response


def folder(name, items, description=""):
    return {"name": name, "description": description, "item": items}


def status_test(code):
    return [f"pm.test('HTTP {code}', () => pm.response.to.have.status({code}));"]


def save_var(var, expr="pm.response.json().id"):
    return [f"pm.collectionVariables.set('{var}', {expr});"]


def main():
    head_user, head_pass = os.environ["HEAD_USERNAME"], os.environ["HEAD_PASSWORD"]
    admin_user, admin_pass = os.environ["ADMIN_USERNAME"], os.environ["ADMIN_PASSWORD"]
    state["integrationApiKey"] = os.environ.get("INTEGRATION_API_KEY", "")
    stamp = datetime.now().strftime("%H%M%S")
    today = datetime.now().date().isoformat()
    t0 = datetime.now().astimezone().replace(second=0, microsecond=0) - timedelta(hours=1)
    at = lambda minutes: (t0 + timedelta(minutes=minutes)).isoformat()  # noqa: E731

    # --- авторизация -------------------------------------------------------------------------------
    login_admin, _, r = item("Вход администратора", "POST", "/api/auth/login/",
                             {"username": "{{adminUsername}}", "password": "{{adminPassword}}"}, auth="none", expect=None,
                             tests=status_test(200) + ["pm.collectionVariables.set('adminToken', pm.response.json().token);"],
                             run=False)
    _, r = call("POST", "/api/auth/login/", {"username": admin_user, "password": admin_pass})
    state["adminToken"] = r["token"]
    login_admin["response"] = [{"name": "200", "code": 200, "status": "OK", "originalRequest": login_admin["request"],
                                "_postman_previewlanguage": "json", "body": json.dumps(mask(r), ensure_ascii=False, indent=2)}]

    login, _, _ = item("Вход (врач/заведующий)", "POST", "/api/auth/login/",
                       {"username": "{{username}}", "password": "{{password}}"}, auth="none", run=False,
                       tests=status_test(200) + ["pm.collectionVariables.set('token', pm.response.json().token);"],
                       description="Возвращает токен доступа (Bearer) и профиль пользователя. Тело: username, password.")
    _, r = call("POST", "/api/auth/login/", {"username": head_user, "password": head_pass})
    state["token"] = r["token"]
    login["response"] = [{"name": "200", "code": 200, "status": "OK", "originalRequest": login["request"],
                          "_postman_previewlanguage": "json", "body": json.dumps(mask(r), ensure_ascii=False, indent=2)}]

    bad_login, *_ = item("Вход: неверный пароль (401)", "POST", "/api/auth/login/",
                         {"username": "{{username}}", "password": "wrong-password"}, auth="none", expect=401,
                         tests=status_test(401))
    me, *_ = item("Текущий пользователь", "GET", "/api/auth/me/", expect=200, tests=status_test(200))
    no_auth, *_ = item("Без токена (401)", "GET", "/api/auth/me/", auth="none", expect=401, tests=status_test(401))
    change_pw, *_ = item("Смена собственного пароля", "POST", "/api/auth/change-password/",
                         {"old_password": "{{password}}", "password": "New-Strong-Pass-1"}, run=False,
                         description="Не выполняется автоматически: меняет пароль текущего пользователя. 204 при успехе.")
    auth_folder = folder("1. Авторизация", [login_admin, login, bad_login, me, no_auth, change_pw])

    # --- пользователи ---------------------------------------------------------------------------------
    new_user = {"username": f"postman.doctor.{stamp}", "password": "Postman-Pass-2026", "surname": "Постманов",
                "firstname": "Пётр", "lastname": "Петрович", "role": 1, "job_title": "Врач-анестезиолог"}
    u_list, *_ = item("Список пользователей", "GET", "/api/users/", auth="adminToken", expect=200,
                      query={"search": "", "role": "", "is_active": "true", "ordering": "surname", "page": 1},
                      tests=status_test(200), description="Поиск: search; фильтры: role, is_active; сортировка: ordering.")
    u_create, _, r = item("Создать пользователя", "POST", "/api/users/", new_user, auth="adminToken", expect=201,
                          tests=status_test(201) + save_var("userId"))
    state["userId"] = r["id"]
    state["doctorId"] = r["id"]
    u_dup, *_ = item("Создать пользователя: дубликат логина (400)", "POST", "/api/users/", new_user, auth="adminToken",
                     expect=400, tests=status_test(400))
    u_get, *_ = item("Пользователь", "GET", "/api/users/{{userId}}/", auth="adminToken", expect=200, tests=status_test(200))
    u_role, *_ = item("Назначить роль / изменить профиль", "PATCH", "/api/users/{{userId}}/",
                      {"role": 1, "job_title": "Врач анестезиолог-реаниматолог"}, auth="adminToken", expect=200,
                      tests=status_test(200))
    u_deact, *_ = item("Деактивировать", "PATCH", "/api/users/{{userId}}/", {"is_active": False}, auth="adminToken",
                       expect=200, tests=status_test(200))
    u_act, *_ = item("Активировать", "PATCH", "/api/users/{{userId}}/", {"is_active": True}, auth="adminToken",
                     expect=200, tests=status_test(200))
    u_pw, *_ = item("Установить пароль", "POST", "/api/users/{{userId}}/set-password/", {"password": "Another-Pass-2026"},
                    auth="adminToken", expect=204, tests=status_test(204))
    u_roles, *_ = item("Справочник ролей", "GET", "/api/users/roles/", expect=200, tests=status_test(200))
    u_staff, *_ = item("Медицинский персонал", "GET", "/api/users/medical-staff/", expect=200, tests=status_test(200))
    users_folder = folder("2. Пользователи (администрирование)", [u_list, u_create, u_dup, u_get, u_role, u_deact, u_act,
                                                                  u_pw, u_roles, u_staff])

    # --- справочники ---------------------------------------------------------------------------------
    catalogs_folder = folder("3. Справочники", [
        item("Перечень справочников", "GET", "/api/catalogs/", expect=200)[0],
        item("Пол", "GET", "/api/catalogs/sex/", expect=200)[0],
        item("Типы операций", "GET", "/api/catalogs/type_operation/", expect=200)[0],
        item("Отделения по типу", "GET", "/api/catalogs/department/", query={"department_type_id": 1}, expect=200)[0],
        item("Методы анестезии", "GET", "/api/catalogs/anesthesia_method/", expect=200)[0],
        item("Шкала Глазго (раздел)", "GET", "/api/catalogs/scale_glazgo/", query={"head_id": 1}, expect=200)[0],
        item("Врачи (ФИО)", "GET", "/api/catalogs/doctor_fio/", expect=200)[0],
        item("Единицы измерения", "GET", "/api/catalogs/measurement_units/", expect=200)[0],
    ], "Все справочники: GET /api/catalogs/{slug}/ (список slug — в перечне).")

    # --- пациенты ---------------------------------------------------------------------------------------
    patient = {"surname": "Постманов", "firstname": "Семён", "lastname": f"Тестович{''.join(chr(1072 + int(c)) for c in stamp)}",
               "sex": 1, "birthdate": "1970-01-15", "blood_group": 2, "blood_rh": 2, "snils": "123-456-789 00", "enp": ""}
    p_create, _, r = item("Создать карточку пациента", "POST", "/api/patients/", patient, expect=201,
                          tests=status_test(201) + save_var("patientId"))
    state["patientId"] = r["id"]
    p_dup, *_ = item("Создать: дубликат (400)", "POST", "/api/patients/", patient, expect=400, tests=status_test(400))
    p_invalid, *_ = item("Создать: ошибки валидации (400)", "POST", "/api/patients/",
                         {"surname": "Ivan0v", "sex": 99, "birthdate": "2999-01-01"}, expect=400, tests=status_test(400))
    p_list, *_ = item("Реестр пациентов", "GET", "/api/patients/", expect=200,
                      query={"status": 1, "search_surname": "Пост", "mine": "false", "page": 1}, tests=status_test(200),
                      description="Фильтры: status (1/2/3, можно несколько), search_surname, mine=true; пагинация page/page_size.")
    p_get, *_ = item("Карточка пациента", "GET", "/api/patients/{{patientId}}/", expect=200, tests=status_test(200))
    p_upd, *_ = item("Изменить карточку", "PATCH", "/api/patients/{{patientId}}/", {"enp": "1234567890123456"}, expect=200,
                     tests=status_test(200))
    patients_items = [p_create, p_dup, p_invalid, p_list, p_get, p_upd]

    # --- операционные случаи --------------------------------------------------------------------------
    operation = {"patient": "{{patientId}}", "operation_date": today, "operation_time": t0.strftime("%H:%M"),
                 "type_operation": 3, "operation_name": "Лапароскопическая холецистэктомия", "diagnosis_name": "ЖКБ",
                 "pid": f"POSTMAN-{stamp}", "doctor": "{{doctorId}}", "nurse": None, "height": 178, "weight": 80}
    real_operation = {**operation, "patient": state["patientId"], "doctor": state["doctorId"]}
    o_create_desc = "Пациент переводится в статус «Активная». Нельзя создать ОС для активного пациента (409)."
    o_create, _, r = item("Создать операционный случай", "POST", "/api/operations/", real_operation, expect=201,
                          tests=status_test(201) + save_var("operationId"), description=o_create_desc)
    o_create["request"]["body"]["raw"] = json.dumps(operation, ensure_ascii=False, indent=2).replace(
        '"{{patientId}}"', "{{patientId}}").replace('"{{doctorId}}"', "{{doctorId}}")
    state["operationId"] = r["id"]
    o_conflict, *_ = item("Создать: пациент уже активен (409)", "POST", "/api/operations/", real_operation, expect=409,
                          tests=status_test(409))
    o_list, *_ = item("Список ОС", "GET", "/api/operations/", query={"status": 1, "mine": "false", "ordering": "-operation_date"},
                      expect=200, tests=status_test(200))
    o_get, *_ = item("ОС (полная информация)", "GET", "/api/operations/{{operationId}}/", expect=200, tests=status_test(200))
    o_upd, *_ = item("Изменить ОС", "PATCH", "/api/operations/{{operationId}}/", {"history_number": "ИБ-2026-001"},
                     expect=200, tests=status_test(200))
    o_finish_fail, *_ = item("Завершить без окончания анестезии (409)", "POST", "/api/operations/{{operationId}}/finish/",
                             expect=409, tests=status_test(409))

    # --- протокол ---------------------------------------------------------------------------------------
    proto = "/api/operations/{{operationId}}/protocol"
    protocol_items = [
        item("Пациент: получить", "GET", f"{proto}/patient-info/", expect=200)[0],
        item("Пациент: изменить", "PATCH", f"{proto}/patient-info/", {"complaints_patient": "Боль в правом подреберье",
                                                                    "features_anamnesis": "Аллергии нет"}, expect=200)[0],
        item("Сведения об анестезии: получить", "GET", f"{proto}/information-anesthesia/", expect=200)[0],
        item("Сведения об анестезии: сохранить", "PUT", f"{proto}/information-anesthesia/",
             {"anesthesia_methods": [1, 7], "patient_arrived": True}, expect=200)[0],
        item("Венозный доступ ПВК: сохранить", "PUT", f"{proto}/venous-access/pvc/",
             [{"vein": 1, "arm": "L", "catheter_diameter_1": 4}], expect=200)[0],
        item("Венозный доступ ЦВК: получить", "GET", f"{proto}/venous-access/cvc/", expect=200)[0],
        item("Венозный доступ ЦВК: сохранить", "PUT", f"{proto}/venous-access/cvc/",
             [{"vein": 4, "arm": "R", "catheter_type": 2, "catheter_diameter_1": 2}], expect=200)[0],
        item("Венозный доступ: вена не того типа (400)", "PUT", f"{proto}/venous-access/cvc/", [{"vein": 1, "arm": "L"}],
             expect=400)[0],
        item("Премедикация: сохранить", "PUT", f"{proto}/premedication/",
             {"oxygen_mask_size": 4, "is_oxygen_insufflation": True, "pharynx_tamponade": False, "rass": 5, "note": ""}, expect=200)[0],
        item("Проходимость дыхательных путей: сохранить", "PUT", f"{proto}/airway/", {
            "tube_installed": True, "attempts": 1, "intubation_method": "INTUBOSCOPY",
            "laryngeal_tube": {"is_installed": False, "size_id": None},
            "intubation_tube": {"type": "OROTRACHEAL", "cuff": True, "size_id": 10},
            "endobronchial_tube": {"type": "", "size_id": None}, "laryngoscopy": {"type": "DL", "blade_type_id": 1},
            "sanacia": [{"type": "TBD", "catheter": "12"}]}, expect=200)[0],
        item("Установка трубок (совместимость)", "PUT", f"{proto}/tube-installations/",
             [{"tube_type": 2, "option": "WITH", "intubation_tube_size": 3, "tube_installed": True, "attempts": 1}], expect=200)[0],
        item("Ларингеальные маски (совместимость)", "PUT", f"{proto}/laryngeal-masks/",
             [{"laryngeal_mask_type": 3, "option": "RG", "oropharyngeal_catheter": 1}], expect=200)[0],
        item("Поддержание анестезии: сохранить", "PUT", f"{proto}/maintaining-anesthesia/",
             {"anesthesia_specificity": 1, "index_bis": 45, "anesthesia_type": None, "symptomatic_picked": False,
              "symptomatic_option": "", "oropharyngeal_catheter": None, "option_mg": None}, expect=200)[0],
        item("Аппарат ИВЛ: сохранить", "PUT", f"{proto}/ventilator/",
             {"ventilator": 1, "monitoring": 3, "patient_status": None, "patient_status_value": None, "chamber": 5,
              "bed": 2, "note": "Без осложнений"}, expect=200)[0],
        item("Пациент передан: сохранить", "PATCH", f"{proto}/patient-transferred/",
             {"b_time": "11:10", "b_ad": 120, "b_ps": 72, "b_spo2": 98, "b_breath_rate": 14,
              "b_scale_glazgo": {"1": 4, "2": 9, "3": 15}, "is_decurarisation": True, "atropine": 0.5, "proserine": 1.5,
              "is_extubation": True, "extubation": 10, "is_died": False}, expect=200)[0],
        item("Направление пациента: сохранить", "PUT", f"{proto}/redirecting-patient/",
             {"department_type": 3, "department": 9, "doctor_fio": "Реаниматологов Р.Р."}, expect=200)[0],
        item("Печатная форма протокола (данные)", "GET", f"{proto}/print/", expect=200)[0],
    ]

    # --- наркозная карта ------------------------------------------------------------------------------
    card = "/api/operations/{{operationId}}/card"
    card_items = [
        item("Сведения о пациенте: получить", "GET", f"{card}/patient-info/", expect=200)[0],
        item("Сведения о пациенте: изменить", "PATCH", f"{card}/patient-info/",
             {"asa": 2, "volume_operation": 2, "department": 1, "ventilator": 1, "monitoring": 3}, expect=200)[0],
        item("PID, дата и время поступления", "PATCH", f"{card}/pid-datetime/",
             {"pid": f"POSTMAN-{stamp}", "operation_date": t0.date().isoformat(), "operation_time": t0.strftime("%H:%M")},
             expect=200)[0],
        item("Анестезиологические действия: сохранить", "PUT", f"{card}/actions/", [
            {"time": at(5), "value": "ANESTHESIA_START"}, {"time": at(10), "value": "INTUBATION"},
            {"time": at(55), "value": "ANESTHESIA_STOP"}], expect=200,
             description="Полная замена. Пересчитывает статус ОС (НА ОПЕРАЦИИ при «Начале анестезии»).")[0],
        item("Анестезиологические действия: получить", "GET", f"{card}/actions/", expect=200)[0],
        item("Действия: окончание раньше начала (400)", "PUT", f"{card}/actions/", [
            {"time": at(30), "value": "ANESTHESIA_START"}, {"time": at(5), "value": "ANESTHESIA_STOP"}], expect=400)[0],
        item("Характеристики дыхания: сохранить", "PUT", f"{card}/breath/", {
            "spontaneous": [{"time_start": at(0), "time_end": at(9)}],
            "forced": [{"time_start": at(10), "time_end": at(50)}]}, expect=200)[0],
        item("Этапы операции: получить", "GET", f"{card}/stages/", expect=200)[0],
        item("Этапы операции: сохранить", "PUT", f"{card}/stages/", [
            {"stage": 1, "time_start": at(15), "description": "Разрез"},
            {"stage": 6, "time_start": at(45), "description": "Ушивание раны"}], expect=200)[0],
        item("Препараты: премедикация", "PUT", f"{card}/drugs/premedication/", [
            {"drug": "Атропин", "items": [{"injection_type": "BOLUS", "measurement_unit": 1, "dose": "0,5", "time_start": at(4)}]}],
             expect=200, description="section: premedication | introduction | maintenance. Доза допускает запятую.")[0],
        item("Препараты: введение в анестезию", "PUT", f"{card}/drugs/introduction/", [
            {"drug": "Фентанил", "items": [{"injection_type": "BOLUS", "measurement_unit": 2, "dose": "100", "time_start": at(8)}]}],
             expect=200)[0],
        item("Препараты: поддержание (инфузия)", "PUT", f"{card}/drugs/maintenance/", [
            {"drug": "Sevoflurane", "items": [{"injection_type": "INFUSION", "measurement_unit": 7, "dose": "2",
                                               "time_start": at(11), "time_end": at(50)}]}], expect=200)[0],
        item("Препараты: пересечение интервалов (400)", "PUT", f"{card}/drugs/maintenance/", [
            {"drug": "Пропофол", "items": [
                {"injection_type": "INFUSION", "measurement_unit": 1, "dose": "1", "time_start": at(10)},
                {"injection_type": "BOLUS", "measurement_unit": 1, "dose": "1", "time_start": at(20)}]}], expect=400)[0],
        item("Итоговые дозы", "GET", f"{card}/drugs/totals/", expect=200)[0],
        item("Инфузионная терапия", "PUT", f"{card}/infusions/", [
            {"solution": "Натрия хлорид 0,9%", "items": [{"dose": "500", "time_start": at(5), "time_end": at(40)}]}], expect=200)[0],
        item("Трансфузионная терапия", "PUT", f"{card}/transfusions/", [
            {"solution": "Эритроцитарная взвесь", "items": [{"gemakon": "№ 12345, 250 мл", "time_start": at(30)}]}], expect=200)[0],
        item("Жидкостные потери", "PUT", f"{card}/liquids/", [
            {"liquid": "Кровопотеря", "items": [{"volume": "150", "time_start": at(20), "time_end": at(45)}]}], expect=200)[0],
        item("ЦМС (мониторы по 5 минут)", "GET", f"{card}/cms/", expect=200)[0],
        item("Печатная форма карты (данные)", "GET", f"{card}/print/", expect=200)[0],
    ]

    # --- мониторинг ---------------------------------------------------------------------------------
    hl7_time = (t0 + timedelta(minutes=12)).strftime("%Y%m%d%H%M%S")
    message = "\r".join([
        "MSH|^~\\&|Mindray|eGateway|||%s||ORU^R01|1|P|2.3.1" % hl7_time,
        f"PID|||POSTMAN-{stamp}||Постманов^Семён",
        "PV1||I|OR^1^1^^^^^^BeneView T8",
        f"OBR||{stamp}^Mindray||Mindray Monitor|||{hl7_time}",
        "OBX||NM|147842^MDC_ECG_HEART_RATE^MDC||74|264864^bpm^MDC|||||F",
        "OBX||NM|150456^MDC_PULS_OXIM_SAT_O2^MDC||98|262688^%^MDC|||||F",
        "OBX||NM|150301^MDC_PRESS_BLD_NONINV_SYS^MDC||122|266016^mmHg^MDC|||||F",
        "OBX||NM|150302^MDC_PRESS_BLD_NONINV_DIA^MDC||78|266016^mmHg^MDC|||||F",
    ])
    monitoring_items = [
        item("Принять HL7-сообщение", "POST", "/api/monitoring/hl7/", {"message": message}, expect=201,
             description="Доступ: заголовок X-API-Key (INTEGRATION_API_KEY) или роль заведующего/ИО.")[0],
        item("Показатели по ОС (графики)", "GET", "/api/operations/{{operationId}}/monitoring/results/", expect=200)[0],
        item("PID за последние N минут", "GET", "/api/monitoring/pids/", query={"minutes": 120}, expect=200)[0],
        item("СППВР: последние показатели (токен)", "GET", "/api/cdss/result/{{operationId}}/", expect=200)[0],
        item("СППВР: по ключу интеграции", "GET", "/api/cdss/result/{{operationId}}/", auth="none",
             headers={"X-API-Key": "{{integrationApiKey}}"}, run=bool(state["integrationApiKey"]),
             description="Требует INTEGRATION_API_KEY на сервере.")[0],
    ]

    # --- лабораторный мониторинг ------------------------------------------------------------------------
    labs = "/api/operations/{{operationId}}/labs"
    labs_items = [
        item("Структура формы", "GET", f"{labs}/schema/", expect=200)[0],
        item("Сохранить результаты", "PUT", f"{labs}/", {"values": {
            "blood_general": {"HGB": "132", "HCT": "41"}, "gas_arterial": {"pH": "7.38", "BE": "-1.5"},
            "urine": {"ket": "+", "color": "Соломенно-жёлтый"}}}, expect=200)[0],
        item("Результаты", "GET", f"{labs}/", expect=200)[0],
        item("Ошибки валидации (400)", "PUT", f"{labs}/", {"values": {"blood_general": {"HGB": "abc"}}}, expect=400)[0],
    ]

    # --- завершение ОС, архив, отмена, удаление ----------------------------------------------------------
    o_finish, *_ = item("Завершить ОС", "POST", "/api/operations/{{operationId}}/finish/", expect=200, tests=status_test(200),
                        description="Требуется действие «Окончание анестезии». Пациент переводится в архив.")
    p_unarch, *_ = item("Вернуть карточку из архива", "POST", "/api/patients/{{patientId}}/unarchive/", expect=200)
    p_arch, *_ = item("Перевести карточку в архив", "POST", "/api/patients/{{patientId}}/archive/", expect=200)
    o_create2, _, r = item("Создать второй ОС (для отмены)", "POST", "/api/operations/",
                           {**real_operation, "operation_date": today}, expect=201,
                           tests=status_test(201) + save_var("operationId2"))
    state["operationId2"] = r["id"]
    o_create2["request"]["body"]["raw"] = o_create["request"]["body"]["raw"]
    o_cancel, *_ = item("Отменить ОС", "POST", "/api/operations/{{operationId2}}/cancel/", {"reason_cancel": "Отказ пациента"},
                        expect=200, tests=status_test(200))
    o_cancel_again, *_ = item("Повторная отмена (409)", "POST", "/api/operations/{{operationId2}}/cancel/",
                              {"reason_cancel": "Повтор"}, expect=409)
    o_delete, *_ = item("Удаление ОС не поддерживается (405)", "DELETE", "/api/operations/{{operationId}}/", expect=405)

    p_tmp = {**patient, "lastname": patient["lastname"] + "б"}
    p_tmp_create, _, r = item("Создать пациента для удаления", "POST", "/api/patients/", p_tmp, expect=201,
                              tests=status_test(201) + save_var("patientToDelete"))
    state["patientToDelete"] = r["id"]
    p_delete, *_ = item("Удалить пациента без ОС", "DELETE", "/api/patients/{{patientToDelete}}/", expect=204,
                        tests=status_test(204), description="Только заведующий/ИО; пациента с ОС удалить нельзя (409).")

    operations_folder = folder("5. Операционные случаи", [o_create, o_conflict, o_list, o_get, o_upd, o_finish_fail])
    lifecycle_folder = folder("10. Жизненный цикл ОС и карточки", [o_finish, p_unarch, p_arch, o_create2, o_cancel,
                                                                   o_cancel_again, o_delete, p_tmp_create, p_delete])

    # --- медикаменты, отчёты, служебное ------------------------------------------------------------------
    med_search, _, r = item("Поиск медикаментов", "GET", "/api/medicaments/", query={"search_name": "атро"}, expect=200,
                            tests=status_test(200) + save_var("medicamentId", "pm.response.json().results[0].id"))
    state["medicamentId"] = r["results"][0]["id"]
    med_get, *_ = item("Медикамент", "GET", "/api/medicaments/{{medicamentId}}/", expect=200, tests=status_test(200))
    misc = [
        folder("11. Медикаменты", [med_search, med_get]),
        folder("12. Отчёты", [
            item("Отчёт 41.10 (JSON)", "GET", "/api/reports/4110/data/", auth="adminToken",
                 query={"date_start": today[:8] + "01", "date_end": today}, expect=200)[0],
            item("Отчёт 41.10 (Excel)", "GET", "/api/reports/4110/", auth="adminToken",
                 query={"date_start": today[:8] + "01", "date_end": today}, expect=200,
                 description="Ответ — файл .xlsx (в Postman: Send and Download).")[0],
            item("Отчёт: врач не имеет доступа (403)", "GET", "/api/reports/4110/data/",
                 query={"date_start": today, "date_end": today}, run=False,
                 description="Выполните с токеном пользователя с ролью «Врач» — ожидается 403.")[0],
        ]),
        folder("13. Служебное", [
            item("Проверка работоспособности", "GET", "/api/health/", auth="none", expect=200)[0],
            item("OpenAPI-схема", "GET", "/api/schema/", auth="none", run=False,
                 description="Swagger UI: {{baseUrl}}/api/docs/, ReDoc: {{baseUrl}}/api/redoc/")[0],
        ]),
    ]
    logout, *_ = item("Выход", "POST", "/api/auth/logout/", expect=204, tests=status_test(204))

    collection = {
        "info": {
            "name": "АРМ Анестезиология — REST API",
            "description": ("Коллекция всех endpoints. Порядок папок — сквозной сценарий: вход → пользователи → пациент → ОС → "
                            "протокол → наркозная карта → мониторинг → лаборатория → завершение/отмена → отчёты. "
                            "Переменные окружения: baseUrl, username/password (заведующий или врач), adminUsername/adminPassword, "
                            "integrationApiKey. Токены и id сохраняются в переменные коллекции тест-скриптами."),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}]},
        "variable": [{"key": k, "value": ""} for k in
                     ("token", "adminToken", "userId", "doctorId", "patientId", "operationId", "operationId2", "patientToDelete",
                      "medicamentId")],
        "item": [
            auth_folder, users_folder, catalogs_folder, folder("4. Пациенты", patients_items), operations_folder,
            folder("6. Протокол анестезии", protocol_items), folder("7. Наркозная карта", card_items),
            folder("8. Мониторинг (HL7, СППВР)", monitoring_items), folder("9. Лабораторный мониторинг", labs_items),
            lifecycle_folder, *misc, folder("14. Завершение сеанса", [logout]),
        ],
    }
    OUT.write_text(json.dumps(collection, ensure_ascii=False, indent=2), encoding="utf-8")
    count = sum(len(f["item"]) for f in collection["item"])
    print(f"Готово: {OUT.name}, запросов: {count}")


if __name__ == "__main__":
    main()
