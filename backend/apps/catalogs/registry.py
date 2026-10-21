"""Реестр справочников: slug в URL → модель и правило выборки."""
from dataclasses import dataclass, field
from typing import Callable

from django.db.models import QuerySet

from . import models as m


@dataclass(frozen=True)
class CatalogEntry:
    model: type
    title: str
    filters: dict = field(default_factory=dict)
    # Разрешённые query-параметры фильтрации: имя параметра → lookup.
    query_filters: dict = field(default_factory=dict)
    # Параметры, без которых справочник не отдаётся (как в исходной системе для отделений).
    required_params: tuple = ()
    queryset: Callable[[], QuerySet] | None = None

    def get_queryset(self) -> QuerySet:
        qs = self.queryset() if self.queryset else self.model.objects.all()
        return qs.filter(**self.filters)


# Файл фикстуры (data/catalogs/<file>.json) → модель. Используется data-миграцией и тестами.
FIXTURES = [
    ("anesthesia_methods", "AnesthesiaMethod"),
    ("anesthesia_specificity", "AnesthesiaSpecificity"),
    ("anesthesia_type", "AnesthesiaType"),
    ("asa", "Asa"),
    ("blade_number", "BladeNumber"),
    ("blade_type", "BladeType"),
    ("blood_groups", "BloodGroup"),
    ("blood_rhs", "BloodRh"),
    ("catheter_diameters", "CatheterDiameter"),
    ("catheter_types", "CatheterType"),
    ("combi_tube_size", "CombiTubeSize"),
    ("department_types", "DepartmentType"),
    ("departments", "Department"),
    ("department_name", "DepartmentName"),
    ("department_picked", "DepartmentPicked"),
    ("diagnoses", "Diagnosis"),
    ("intubation_tube_size", "IntubationTubeSize"),
    ("intuboscope_cuff_size", "IntuboscopeCuffSize"),
    ("intuboscope_cuff_type", "IntuboscopeCuffType"),
    ("laryngeal_mask_type", "LaryngealMaskType"),
    ("measurement_units", "MeasurementUnit"),
    ("monitoring", "Monitoring"),
    ("oropharyngeal_catheter", "OropharyngealCatheter"),
    ("oxygen_mask_sizes", "OxygenMaskSize"),
    ("patient_statuses", "PatientStatus"),
    ("pressure_type", "PressureType"),
    ("rass", "Rass"),
    ("scale_glazgo_head", "ScaleGlazgoHead"),
    ("scale_glazgo", "ScaleGlazgo"),
    ("scale_meyo_head", "ScaleMeyoHead"),
    ("scale_meyo", "ScaleMeyo"),
    ("sex", "Sex"),
    ("tube_type", "TubeType"),
    ("type_operations", "TypeOperation"),
    ("veins", "Vein"),
    ("ventilators", "Ventilator"),
    ("volume_operations", "VolumeOperation"),
]

# Переименования полей фикстур (исходные имена колонок → поля моделей).
FIELD_RENAMES = {"scale_glazgo_head_id": "head_id", "scale_meyo_head_id": "head_id"}


def _doctors_queryset():
    from apps.accounts.models import Role, User

    return User.objects.filter(role=Role.DOCTOR, is_active=True).order_by("surname", "firstname")


CATALOGS: dict[str, CatalogEntry] = {
    "anesthesia_method": CatalogEntry(m.AnesthesiaMethod, "Методы анестезии", query_filters={"type": "type"}),
    "anesthesia_specificity": CatalogEntry(m.AnesthesiaSpecificity, "Особенности анестезии"),
    "anesthesia_type": CatalogEntry(m.AnesthesiaType, "Виды анестезии"),
    "asa": CatalogEntry(m.Asa, "Классы ASA"),
    "blade_number": CatalogEntry(m.BladeNumber, "Номера клинков"),
    "blade_type": CatalogEntry(m.BladeType, "Типы клинков"),
    "blood_group": CatalogEntry(m.BloodGroup, "Группы крови"),
    "blood_rh": CatalogEntry(m.BloodRh, "Резус-факторы"),
    "catheter_diameter": CatalogEntry(m.CatheterDiameter, "Диаметры катетеров"),
    "catheter_type": CatalogEntry(m.CatheterType, "Типы катетеров"),
    "combi_tube_size": CatalogEntry(m.CombiTubeSize, "Размеры CombiTube"),
    "department": CatalogEntry(m.Department, "Отделения", query_filters={"department_type_id": "department_type_id"},
                               required_params=("department_type_id",)),
    "department_type": CatalogEntry(m.DepartmentType, "Типы отделений"),
    "department_name": CatalogEntry(m.DepartmentName, "Наименования отделений"),
    "department_picked": CatalogEntry(m.DepartmentPicked, "Направления перевода"),
    "diagnosis": CatalogEntry(m.Diagnosis, "Диагнозы (МКБ-10)"),
    "doctor_fio": CatalogEntry(m.Diagnosis, "Врачи (ФИО)", queryset=_doctors_queryset),
    "intubation_tube_size": CatalogEntry(m.IntubationTubeSize, "Размеры интубационных трубок"),
    "intuboscope_cuff_size": CatalogEntry(m.IntuboscopeCuffSize, "Диаметры манжет"),
    "intuboscope_cuff_type": CatalogEntry(m.IntuboscopeCuffType, "Типы манжет"),
    "laryngeal_mask_type": CatalogEntry(m.LaryngealMaskType, "Типы ларингеальных масок"),
    "measurement_units": CatalogEntry(m.MeasurementUnit, "Единицы измерения"),
    "monitoring": CatalogEntry(m.Monitoring, "Мониторы"),
    "oropharyngeal_catheter": CatalogEntry(m.OropharyngealCatheter, "Орофарингеальные катетеры"),
    "oxygen_mask_size": CatalogEntry(m.OxygenMaskSize, "Размеры кислородных масок"),
    "patient_status": CatalogEntry(m.PatientStatus, "Статусы пациента (ИВЛ)"),
    "pressure_type": CatalogEntry(m.PressureType, "Типы давления"),
    "rass": CatalogEntry(m.Rass, "Шкала RASS"),
    "scale_glazgo_head": CatalogEntry(m.ScaleGlazgoHead, "Разделы шкалы Глазго"),
    "scale_glazgo": CatalogEntry(m.ScaleGlazgo, "Шкала Глазго", query_filters={"head_id": "head_id"}),
    "scale_meyo_head": CatalogEntry(m.ScaleMeyoHead, "Разделы шкалы Мейо (FOUR)"),
    "scale_meyo": CatalogEntry(m.ScaleMeyo, "Шкала Мейо (FOUR)", query_filters={"head_id": "head_id"}),
    "sex": CatalogEntry(m.Sex, "Пол"),
    "tube_type": CatalogEntry(m.TubeType, "Типы трубок"),
    "type_operation": CatalogEntry(m.TypeOperation, "Типы операций"),
    "vein_pvc": CatalogEntry(m.Vein, "Вены (ПВК)", filters={"type": m.Vein.Kind.PVC}),
    "vein_cvc": CatalogEntry(m.Vein, "Вены (ЦВК)", filters={"type": m.Vein.Kind.CVC}),
    "ventilator": CatalogEntry(m.Ventilator, "Аппараты ИВЛ"),
    "volume_operation": CatalogEntry(m.VolumeOperation, "Объёмы операций"),
}
