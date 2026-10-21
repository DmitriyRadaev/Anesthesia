from datetime import date
from io import BytesIO

import pytest
from openpyxl import load_workbook

from apps.operations.models import Operation
from apps.protocol.models import InformationAnesthesia, PatientTransferred
from apps.reports.services import build_report_4110

pytestmark = pytest.mark.django_db

URL = "/api/reports/4110/"
PERIOD = {"date_start": "2026-10-01", "date_end": "2026-10-31"}


def finished(make_operation, methods, type_operation_id=3, died=None, **kwargs):
    op = make_operation(status=Operation.Status.FINISHED, type_operation_id=type_operation_id,
                        operation_date=kwargs.pop("operation_date", date(2026, 10, 5)), **kwargs)
    info = InformationAnesthesia.objects.create(operation=op)
    info.anesthesia_methods.set(methods)
    if died is not None:
        PatientTransferred.objects.create(operation=op, is_died=died)
    return op


def rows(report):
    return {row.key: row for row in report.rows}


def test_report_counts(make_operation):
    # методы: 1 — Ингаляционная (GENERAL), 7 — Эпидуральная, 8 — Спинальная (LOCAL)
    finished(make_operation, [7], type_operation_id=3)                 # эпидуральная, плановая
    finished(make_operation, [8], type_operation_id=1, died=True)      # спинальная, экстренная, умер
    finished(make_operation, [1, 7], type_operation_id=2)              # сочетанная + эпидуральная, неотложная
    finished(make_operation, [7], operation_date=date(2026, 9, 1))     # вне периода
    make_operation(status=Operation.Status.ARRIVED)                    # не завершена
    report = build_report_4110(date(2026, 10, 1), date(2026, 10, 31))
    r = rows(report)
    assert report.operations_count == 3
    assert (r["epidural"].anesthesia_planned, r["epidural"].anesthesia_urgent) == (1, 1)
    assert (r["spinal"].anesthesia_emergency, r["spinal"].patient_died) == (1, 1)
    assert r["combined"].anesthesia_urgent == 1
    assert (r["total"].anesthesia_planned, r["total"].anesthesia_emergency, r["total"].anesthesia_urgent) == (1, 1, 2)
    assert r["tiva"].anesthesia_planned is None


def test_general_count_does_not_leak_between_operations(make_operation):
    """Исправленная ошибка исходной системы: счётчик GENERAL не должен переноситься на следующую операцию."""
    finished(make_operation, [1])      # только общая
    finished(make_operation, [7])      # только эпидуральная — НЕ сочетанная
    r = rows(build_report_4110(date(2026, 10, 1), date(2026, 10, 31)))
    assert r["combined"].anesthesia_planned is None
    assert r["epidural"].anesthesia_planned == 1


def test_report_excel_download(client_for, head, make_operation):
    finished(make_operation, [7])
    response = client_for(head).get(URL, PERIOD)
    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/vnd.openxmlformats")
    assert "41.10" in response["Content-Disposition"]
    sheet = load_workbook(BytesIO(response.content)).active
    assert sheet["A1"].value == "Протокол 41.10 за период: 01.10.2026 - 31.10.2026"
    assert sheet["A6"].value == "Эпидуральная анестезия" and sheet["E6"].value == 1


def test_report_json_and_validation(client_for, admin_user, doctor):
    client = client_for(admin_user)
    assert client.get(f"{URL}data/", PERIOD).json()["rows"][-1]["name"] == "Всего"
    assert client.get(URL, {"date_start": "2026-10-31", "date_end": "2026-10-01"}).status_code == 400
    assert client.get(URL).status_code == 400
    assert client_for(doctor).get(URL, PERIOD).status_code == 403
