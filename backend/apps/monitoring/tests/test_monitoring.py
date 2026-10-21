from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from apps.monitoring.hl7 import HL7ParseError, MLLPBuffer, parse_message
from apps.monitoring.ingest import store_message
from apps.monitoring.models import HL7Result

SAMPLE = "\r".join([
    "MSH|^~\\&|Mindray|eGateway|||20261001091500||ORU^R01|1|P|2.3.1",
    "PID|||PID-1||Иванов^Иван",
    "PV1||I|OR^5^2^^^^^^BeneView T8",
    "OBR||777^Mindray||Mindray Monitor|||20261001091500.1234",
    "OBX||NM|150456^MDC_PULS_OXIM_SAT_O2^MDC||98|262688^%^MDC|||||F",
    "OBX||NM|147842^MDC_ECG_HEART_RATE^MDC||72|264864^bpm^MDC|||||F",
    "OBX||NM|150301^MDC_PRESS_BLD_NONINV_SYS^MDC||121|266016^mmHg^MDC|||||F",
])


def test_parse_message():
    result = parse_message(SAMPLE)
    assert result.pid == "PID-1"
    assert (result.department, result.room, result.bed, result.device) == ("OR", "5", "2", "BeneView T8")
    assert result.order_number == "777"
    assert timezone.localtime(result.observation_at).replace(tzinfo=None) == datetime(2026, 10, 1, 9, 15)
    assert result.observations[0] == {"observation_number": "150456", "observation_name": "MDC_PULS_OXIM_SAT_O2",
                                      "observation_value": "98", "unit": "%"}
    assert len(result.observations) == 3


def test_parse_message_without_pid_fails():
    with pytest.raises(HL7ParseError):
        parse_message("OBR||1||x|||20261001091500").as_model_kwargs()


def test_mllp_buffer_splits_stream():
    buffer = MLLPBuffer()
    framed = f"\x0b{SAMPLE}\x1c\r"
    assert buffer.feed(framed[:40]) == []
    messages = buffer.feed(framed[40:] + framed)
    assert len(messages) == 2 and messages[0] == SAMPLE


@pytest.mark.django_db
def test_store_message_is_idempotent():
    store_message(SAMPLE)
    store_message(SAMPLE.replace("|98|", "|99|"))
    assert HL7Result.objects.count() == 1
    assert HL7Result.objects.get().values()["MDC_PULS_OXIM_SAT_O2"] == "99"


@pytest.mark.django_db
def test_ingest_endpoint_requires_key_or_supervisor(client_for, anon_client, nurse, head, settings):
    settings.INTEGRATION_API_KEY = "test-integration-key"
    url = "/api/monitoring/hl7/"
    assert anon_client.post(url, {"message": SAMPLE}, format="json").status_code == 401
    assert client_for(nurse).post(url, {"message": SAMPLE}, format="json").status_code == 403
    assert anon_client.post(url, {"message": SAMPLE}, format="json",
                            HTTP_X_API_KEY="wrong").status_code == 401
    created = anon_client.post(url, {"message": SAMPLE}, format="json", HTTP_X_API_KEY="test-integration-key")
    assert created.status_code == 201 and created.json()["pid"] == "PID-1"
    assert client_for(head).post(url, {"message": "garbage"}, format="json").status_code == 400


@pytest.mark.django_db
def test_operation_results_and_recent_pids(client_for, nurse, make_operation):
    op = make_operation(operation_date=timezone.localdate(), operation_time=(timezone.localtime() - timedelta(hours=1)).time())
    now = timezone.now()
    for minutes in (3, 2, 1):
        HL7Result.objects.create(observation_at=now - timedelta(minutes=minutes), pid=op.pid, order_number=str(minutes),
                                 observations=[{"observation_name": "MDC_ECG_HEART_RATE", "observation_value": "70"}])
    client = client_for(nurse)
    body = client.get(f"/api/operations/{op.id}/monitoring/results/").json()
    assert body["count"] == 3 and body["pid"] == op.pid
    incremental = client.get(f"/api/operations/{op.id}/monitoring/results/",
                             {"date_start": (now - timedelta(minutes=2)).isoformat()}).json()
    assert incremental["count"] == 1
    assert client.get("/api/monitoring/pids/").json()["pids"] == [op.pid]


@pytest.mark.django_db
def test_cdss_latest_vitals(client_for, anon_client, nurse, make_operation, settings):
    settings.INTEGRATION_API_KEY = "cdss-key"
    op = make_operation()
    store_message(SAMPLE)
    url = f"/api/cdss/result/{op.id}/"
    assert anon_client.get(url).status_code == 401
    body = anon_client.get(url, HTTP_X_API_KEY="cdss-key").json()
    assert body["ЧСС"] == "72" and body["SpO2"] == "98"
    assert body["АД"] == {"type": "NONINV", "SYS": "121"}
    assert client_for(nurse).get(url).status_code == 200
    assert anon_client.get("/api/cdss/result/999999/", HTTP_X_API_KEY="cdss-key").status_code == 404
