"""Справочники (НСИ). Идентификаторы записей совпадают с исходной системой."""
from django.db import models


class BaseCatalog(models.Model):
    name = models.CharField("наименование", max_length=255)
    code = models.CharField("код", max_length=64, blank=True)
    description = models.CharField("описание", max_length=500, blank=True)

    class Meta:
        abstract = True
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name


def _meta(verbose: str, plural: str):
    return type("Meta", (BaseCatalog.Meta,), {"verbose_name": verbose, "verbose_name_plural": plural})


class AnesthesiaMethod(BaseCatalog):
    class Kind(models.TextChoices):
        GENERAL = "GENERAL", "Общая"
        LOCAL = "LOCAL", "Местная"

    type = models.CharField("вид", max_length=16, choices=Kind.choices)
    Meta = _meta("метод анестезии", "методы анестезии")


class AnesthesiaSpecificity(BaseCatalog):
    Meta = _meta("особенность анестезии", "особенности анестезии")


class AnesthesiaType(BaseCatalog):
    Meta = _meta("вид анестезии", "виды анестезии")


class Asa(BaseCatalog):
    Meta = _meta("класс ASA", "классы ASA")


class BladeNumber(BaseCatalog):
    Meta = _meta("номер клинка", "номера клинков")


class BladeType(BaseCatalog):
    Meta = _meta("тип клинка", "типы клинков")


class BloodGroup(BaseCatalog):
    Meta = _meta("группа крови", "группы крови")


class BloodRh(BaseCatalog):
    Meta = _meta("резус-фактор", "резус-факторы")


class CatheterDiameter(BaseCatalog):
    Meta = _meta("диаметр катетера", "диаметры катетеров")


class CatheterType(BaseCatalog):
    Meta = _meta("тип катетера", "типы катетеров")


class CombiTubeSize(BaseCatalog):
    Meta = _meta("размер CombiTube", "размеры CombiTube")


class DepartmentType(BaseCatalog):
    Meta = _meta("тип отделения", "типы отделений")


class Department(BaseCatalog):
    department_type = models.ForeignKey(DepartmentType, on_delete=models.PROTECT, related_name="departments",
                                        verbose_name="тип отделения")
    Meta = _meta("отделение", "отделения")


class DepartmentName(BaseCatalog):
    Meta = _meta("наименование отделения", "наименования отделений")


class DepartmentPicked(BaseCatalog):
    Meta = _meta("направление перевода", "направления перевода")


class Diagnosis(BaseCatalog):
    Meta = _meta("диагноз (МКБ-10)", "диагнозы (МКБ-10)")


class IntubationTubeSize(BaseCatalog):
    Meta = _meta("размер интубационной трубки", "размеры интубационных трубок")


class IntuboscopeCuffSize(BaseCatalog):
    Meta = _meta("диаметр манжеты", "диаметры манжет")


class IntuboscopeCuffType(BaseCatalog):
    Meta = _meta("тип манжеты", "типы манжет")


class LaryngealMaskType(BaseCatalog):
    Meta = _meta("тип ларингеальной маски", "типы ларингеальных масок")


class MeasurementUnit(BaseCatalog):
    Meta = _meta("единица измерения", "единицы измерения")


class Monitoring(BaseCatalog):
    Meta = _meta("монитор", "мониторы")


class OropharyngealCatheter(BaseCatalog):
    Meta = _meta("орофарингеальный катетер", "орофарингеальные катетеры")


class OxygenMaskSize(BaseCatalog):
    Meta = _meta("размер кислородной маски", "размеры кислородных масок")


class PatientStatus(BaseCatalog):
    Meta = _meta("статус пациента (ИВЛ)", "статусы пациента (ИВЛ)")


class PressureType(BaseCatalog):
    Meta = _meta("тип давления", "типы давления")


class Rass(BaseCatalog):
    value = models.CharField("балл", max_length=8)
    Meta = _meta("уровень шкалы RASS", "шкала RASS")


class ScaleGlazgoHead(BaseCatalog):
    Meta = _meta("раздел шкалы Глазго", "разделы шкалы Глазго")


class ScaleGlazgo(BaseCatalog):
    head = models.ForeignKey(ScaleGlazgoHead, on_delete=models.PROTECT, related_name="items", verbose_name="раздел")
    value = models.CharField("балл", max_length=8)
    Meta = _meta("позиция шкалы Глазго", "шкала Глазго")


class ScaleMeyoHead(BaseCatalog):
    Meta = _meta("раздел шкалы Мейо (FOUR)", "разделы шкалы Мейо (FOUR)")


class ScaleMeyo(BaseCatalog):
    head = models.ForeignKey(ScaleMeyoHead, on_delete=models.PROTECT, related_name="items", verbose_name="раздел")
    value = models.CharField("балл", max_length=8)
    Meta = _meta("позиция шкалы Мейо (FOUR)", "шкала Мейо (FOUR)")


class Sex(BaseCatalog):
    Meta = _meta("пол", "пол")


class TubeType(BaseCatalog):
    Meta = _meta("тип трубки", "типы трубок")


class TypeOperation(BaseCatalog):
    EMERGENCY = 1
    URGENT = 2
    PLANNED = 3
    Meta = _meta("тип операции", "типы операций")


class Vein(BaseCatalog):
    class Kind(models.IntegerChoices):
        PVC = 1, "ПВК"
        CVC = 2, "ЦВК"

    type = models.PositiveSmallIntegerField("тип доступа", choices=Kind.choices)
    Meta = _meta("вена", "вены")


class Ventilator(BaseCatalog):
    Meta = _meta("аппарат ИВЛ", "аппараты ИВЛ")


class VolumeOperation(BaseCatalog):
    Meta = _meta("объём операции", "объёмы операций")
