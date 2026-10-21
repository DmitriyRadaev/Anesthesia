"""Демонстрационные данные для ознакомления и ручного тестирования (НЕ для production).

Создаёт пациентов в разных статусах, операционные случаи, заполненные блоки протокола и наркозной карты
и синтетические показатели мониторов. Все записи проходят через ORM в реальную БД; демо-пациенты помечены
ЕНП с префиксом ``DEMO-`` и удаляются флагом ``--reset``.
"""
import math
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.card.models import (
    AnestheticAction,
    BreathCharacteristic,
    DrugAdministration,
    Infusion,
    Liquid,
    OperationStage,
)
from apps.monitoring.models import HL7Result
from apps.operations.models import Operation
from apps.patients.models import Patient
from apps.protocol.models import (
    InformationAnesthesia,
    PatientTransferred,
    RedirectingPatient,
)

DEMO_PREFIX = "DEMO-"


class Command(BaseCommand):
    help = "Загружает демонстрационных пациентов, операционные случаи и показатели мониторов."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Удалить ранее созданные демо-данные и выйти")

    @transaction.atomic
    def handle(self, *args, reset: bool, **options):
        demo_patients = Patient.objects.filter(enp__startswith=DEMO_PREFIX)
        demo_ops = Operation.objects.filter(patient__in=demo_patients)
        HL7Result.objects.filter(pid__startswith=DEMO_PREFIX).delete()
        demo_ops.delete()
        demo_patients.delete()
        if reset:
            self.stdout.write(self.style.SUCCESS("Демо-данные удалены."))
            return

        doctor = User.objects.filter(role=Role.DOCTOR, is_active=True).order_by("id").first()
        nurse = User.objects.filter(role=Role.NURSE, is_active=True).order_by("id").first()
        if doctor is None or nurse is None:
            raise CommandError("Нужны активные пользователи с ролями «Врач» и «Медсестра». "
                               "Создайте их через админ-панель или `manage.py load_users`.")

        rnd = random.Random(42)
        now = timezone.localtime().replace(second=0, microsecond=0)

        def patient(n, surname, firstname, lastname, sex, birthdate, status):
            return Patient.objects.create(surname=surname, firstname=firstname, lastname=lastname, sex_id=sex,
                                          birthdate=birthdate, blood_group_id=rnd.randint(1, 6),
                                          blood_rh_id=rnd.randint(1, 2), status=status, enp=f"{DEMO_PREFIX}{n:04d}")

        def operation(p, start: datetime, status, name, **extra):
            return Operation.objects.create(
                patient=p, status=status, operation_date=start.date(), operation_time=start.time(),
                pid=f"{DEMO_PREFIX}{p.enp[-4:]}", operation_name=name, type_operation_id=extra.pop("type_operation_id", 3),
                diagnosis_name=extra.pop("diagnosis_name", "Желчнокаменная болезнь"), height=Decimal(176),
                weight=Decimal(82), asa_id=2, volume_operation_id=2, department_id=1, doctor=doctor, nurse=nurse, **extra)

        patient(1, "Новикова", "Анна", "Сергеевна", 2, date(1990, 4, 2), Patient.Status.NEW)

        arrived = operation(patient(2, "Сидоров", "Алексей", "Петрович", 1, date(1968, 11, 23), Patient.Status.ACTIVE),
                            now - timedelta(minutes=20), Operation.Status.ARRIVED, "Грыжесечение",
                            diagnosis_name="Паховая грыжа")

        start = now - timedelta(minutes=75)
        active = operation(patient(3, "Кузнецова", "Мария", "Ивановна", 2, date(1955, 7, 14), Patient.Status.ACTIVE),
                           start, Operation.Status.ON_OPERATION, "Лапароскопическая холецистэктомия")
        self._fill_card(active, start, finished=False)
        self._vitals(active, start - timedelta(minutes=5), now, rnd)

        past = now - timedelta(days=6, hours=3)
        finished = operation(patient(4, "Морозов", "Дмитрий", "Олегович", 1, date(1979, 1, 30), Patient.Status.ARCHIVE),
                             past, Operation.Status.FINISHED, "Резекция желудка", type_operation_id=1)
        self._fill_card(finished, past, finished=True)
        self._vitals(finished, past - timedelta(minutes=5), past + timedelta(minutes=150), rnd)
        info = InformationAnesthesia.objects.create(operation=finished, patient_arrived=True)
        info.anesthesia_methods.set([1, 7])
        PatientTransferred.objects.create(operation=finished, is_decurarisation=True, atropine=0.5, proserine=1.5,
                                          is_extubation=True, extubation=15, is_died=False)
        RedirectingPatient.objects.create(operation=finished, department_type_id=3, department_id=9,
                                          doctor_fio="Реаниматологов Р.Р.")

        operation(patient(5, "Волкова", "Елена", "Андреевна", 2, date(1984, 9, 8), Patient.Status.ARCHIVE),
                  now - timedelta(days=2), Operation.Status.CANCELLED, "Аппендэктомия",
                  reason_cancel="Отказ пациента от операции")

        self.stdout.write(self.style.SUCCESS(
            f"Демо-данные созданы: 5 пациентов, 4 ОС (ПОСТУПИЛ #{arrived.id}, НА ОПЕРАЦИИ #{active.id}, "
            f"ЗАВЕРШЁН #{finished.id}, ОТМЕНЁН). Врач: {doctor.username}, медсестра: {nurse.username}."))

    def _fill_card(self, op: Operation, start: datetime, finished: bool):
        at = lambda minutes: start + timedelta(minutes=minutes)  # noqa: E731
        actions = [(5, "ANESTHESIA_START"), (5, "PREMEDICATION"), (10, "INTRODUCTION"), (15, "INTUBATION")]
        if finished:
            actions += [(130, "EXTUBATION"), (140, "ANESTHESIA_STOP")]
        AnestheticAction.objects.bulk_create([AnestheticAction(operation=op, time=at(m), value=v) for m, v in actions])
        BreathCharacteristic.objects.bulk_create([
            BreathCharacteristic(operation=op, breath_type="spontaneous", time_start=at(0), time_end=at(14)),
            BreathCharacteristic(operation=op, breath_type="forced", time_start=at(15), time_end=at(125 if finished else 70)),
        ])
        stages = {1: (25, "Разрез"), 2: (40, "Ревизия брюшной полости"), 6: (120, "Ушивание раны")}
        OperationStage.objects.bulk_create([
            OperationStage(operation=op, stage=n, time_start=at(stages[n][0]) if n in stages and (finished or stages[n][0] < 70)
                           else None, description=stages.get(n, (0, ""))[1])
            for n in range(1, 7)
        ])
        drug = lambda section, name, unit, dose, m, kind="BOLUS", end=None: DrugAdministration(  # noqa: E731
            operation=op, section=section, drug=name, injection_type=kind, measurement_unit_id=unit,
            dose=Decimal(dose), time_start=at(m), time_end=at(end) if end else None)
        DrugAdministration.objects.bulk_create([
            drug("premedication", "Атропин", 1, "0.5", 5),
            drug("premedication", "Дексаметазон", 1, "8", 6),
            drug("introduction", "Фентанил", 2, "100", 10),
            drug("introduction", "Рокурония бромид", 1, "50", 12),
            drug("maintenance", "Sevoflurane", 7, "2", 16, "INFUSION", 125 if finished else None),
            drug("maintenance", "Фентанил", 2, "100", 60),
        ])
        Infusion.objects.create(operation=op, solution="Натрия хлорид 0,9%", dose=Decimal(500), time_start=at(5),
                                time_end=at(65))
        if finished:
            Liquid.objects.create(operation=op, liquid="Кровопотеря", volume=Decimal(250), time_start=at(40), time_end=at(110))

    def _vitals(self, op: Operation, start: datetime, end: datetime, rnd: random.Random):
        rows, t, i = [], start, 0
        while t <= end:
            wave = math.sin(i / 9)
            values = {
                "MDC_ECG_HEART_RATE": round(72 + 8 * wave + rnd.uniform(-2, 2)),
                "MDC_PULS_OXIM_PULS_RATE": round(71 + 8 * wave + rnd.uniform(-2, 2)),
                "MDC_PULS_OXIM_SAT_O2": round(97 + rnd.uniform(-1, 2)),
                "MDC_PRESS_BLD_NONINV_SYS": round(120 + 12 * wave + rnd.uniform(-3, 3)),
                "MDC_PRESS_BLD_NONINV_DIA": round(75 + 6 * wave + rnd.uniform(-2, 2)),
                "MDC_PRESS_BLD_NONINV_MEAN": round(90 + 8 * wave),
                "MDC_CO2_RESP_RATE": round(14 + 2 * math.cos(i / 7)),
                "MDC_TEMP": round(36.6 + rnd.uniform(-0.2, 0.2), 1),
                "MDC_EEG_BISPECTRAL_INDEX": round(48 + 7 * wave),
                "MDC_CONC_AWAY_O2_INSP": 50,
                "MDC_CONC_AWAY_CO2_INSP": 0,
                "MDC_CONC_AWAY_SEVOFL_INSP": 1.9,
            }
            observations = [{"observation_number": "", "observation_name": k, "observation_value": str(v), "unit": ""}
                            for k, v in values.items()]
            rows.append(HL7Result(observation_at=t, pid=op.pid, order_number=str(i), department="OR", room="1",
                                  bed="1", device="BeneView T8", observations=observations))
            t += timedelta(minutes=1)
            i += 1
        HL7Result.objects.bulk_create(rows)
