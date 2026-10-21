"""Протокол анестезии: блоки, заполняемые по операционному случаю."""
from django.db import models

from apps.catalogs import models as catalogs

OPERATION = "operations.Operation"


class InformationAnesthesia(models.Model):
    """Сведения об анестезии: выбранные методы (общая/местная) и факт доставки пациента."""

    operation = models.OneToOneField(OPERATION, on_delete=models.CASCADE, related_name="information_anesthesia")
    anesthesia_methods = models.ManyToManyField(catalogs.AnesthesiaMethod, blank=True, verbose_name="методы анестезии")
    patient_arrived = models.BooleanField("пациент доставлен, начат мониторинг, обеспечен венозный доступ", null=True)

    class Meta:
        verbose_name = "сведения об анестезии"
        verbose_name_plural = "сведения об анестезии"


class VenousAccess(models.Model):
    """Венозный доступ: периферический (ПВК) или центральный (ЦВК) катетер."""

    class Kind(models.IntegerChoices):
        PVC = catalogs.Vein.Kind.PVC.value, "ПВК"
        CVC = catalogs.Vein.Kind.CVC.value, "ЦВК"

    class Arm(models.TextChoices):
        LEFT = "L", "Левая"
        RIGHT = "R", "Правая"

    operation = models.ForeignKey(OPERATION, on_delete=models.CASCADE, related_name="venous_accesses")
    kind = models.PositiveSmallIntegerField("вид доступа", choices=Kind.choices)
    vein = models.ForeignKey(catalogs.Vein, on_delete=models.PROTECT, verbose_name="вена")
    arm = models.CharField("сторона", max_length=1, choices=Arm.choices, blank=True)
    catheter_type = models.ForeignKey(catalogs.CatheterType, on_delete=models.SET_NULL, null=True, blank=True,
                                      verbose_name="тип катетера")
    catheter_diameter_1 = models.ForeignKey(catalogs.CatheterDiameter, on_delete=models.SET_NULL, null=True,
                                            blank=True, related_name="+", verbose_name="диаметр (просвет 1)")
    catheter_diameter_2 = models.ForeignKey(catalogs.CatheterDiameter, on_delete=models.SET_NULL, null=True,
                                            blank=True, related_name="+", verbose_name="диаметр (просвет 2)")
    catheter_diameter_3 = models.ForeignKey(catalogs.CatheterDiameter, on_delete=models.SET_NULL, null=True,
                                            blank=True, related_name="+", verbose_name="диаметр (просвет 3)")

    class Meta:
        verbose_name = "венозный доступ"
        verbose_name_plural = "венозный доступ"
        ordering = ["kind", "vein_id", "arm"]


class Premedication(models.Model):
    operation = models.OneToOneField(OPERATION, on_delete=models.CASCADE, related_name="protocol_premedication")
    oxygen_mask_size = models.ForeignKey(catalogs.OxygenMaskSize, on_delete=models.SET_NULL, null=True, blank=True,
                                         verbose_name="размер кислородной маски")
    is_oxygen_insufflation = models.BooleanField("инсуффляция кислорода", null=True)
    pharynx_tamponade = models.BooleanField("тампонада глотки", null=True)
    rass = models.ForeignKey(catalogs.Rass, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="RASS")
    note = models.TextField("примечание", blank=True)

    class Meta:
        verbose_name = "премедикация (протокол)"
        verbose_name_plural = "премедикация (протокол)"


class TubeInstallationPick(models.Model):
    operation = models.ForeignKey(OPERATION, on_delete=models.CASCADE, related_name="tube_installations")
    tube_type = models.ForeignKey(catalogs.TubeType, on_delete=models.PROTECT, verbose_name="тип трубки")
    option = models.CharField("опция", max_length=32, blank=True)
    combi_tube_size = models.ForeignKey(catalogs.CombiTubeSize, on_delete=models.SET_NULL, null=True, blank=True)
    intubation_tube_size = models.ForeignKey(catalogs.IntubationTubeSize, on_delete=models.SET_NULL, null=True,
                                             blank=True)
    pressure_type = models.ForeignKey(catalogs.PressureType, on_delete=models.SET_NULL, null=True, blank=True)
    tube_installed = models.BooleanField("трубка установлена", null=True)
    attempts = models.PositiveSmallIntegerField("количество попыток", null=True, blank=True)

    class Meta:
        verbose_name = "установка трубки"
        verbose_name_plural = "установка трубок"
        constraints = [models.UniqueConstraint(fields=["operation", "tube_type"], name="unique_tube_type_per_operation")]


class LaryngealMaskInstallation(models.Model):
    class Option(models.TextChoices):
        DL = "DL", "Ларингоскопия прямая"
        VL = "VL", "Ларингоскопия изогнутым клинком"
        VP = "VP", "Ларингоскопия клинком с подвижным наконечником"
        CON = "CON", "Коникотомия"
        TRA = "TRA", "Трахеостомия"
        RG = "RG", "Санация ротоглотки"
        TBD = "TBD", "Санация ТБД"

    operation = models.ForeignKey(OPERATION, on_delete=models.CASCADE, related_name="laryngeal_masks")
    laryngeal_mask_type = models.ForeignKey(catalogs.LaryngealMaskType, on_delete=models.PROTECT)
    option = models.CharField("опция", max_length=8, choices=Option.choices, blank=True)
    option_ext = models.CharField("доп. опция", max_length=255, blank=True)
    blade_type = models.ForeignKey(catalogs.BladeType, on_delete=models.SET_NULL, null=True, blank=True)
    blade_number = models.ForeignKey(catalogs.BladeNumber, on_delete=models.SET_NULL, null=True, blank=True)
    tube_installed = models.BooleanField(null=True)
    attempts_number = models.PositiveSmallIntegerField(null=True, blank=True)
    intuboscope_cuff_type = models.ForeignKey(catalogs.IntuboscopeCuffType, on_delete=models.SET_NULL, null=True,
                                              blank=True)
    intuboscope_cuff_size = models.ForeignKey(catalogs.IntuboscopeCuffSize, on_delete=models.SET_NULL, null=True,
                                              blank=True)
    oropharyngeal_catheter = models.ForeignKey(catalogs.OropharyngealCatheter, on_delete=models.SET_NULL, null=True,
                                               blank=True, related_name="+")
    oropharyngeal_catheter_ext = models.ForeignKey(catalogs.OropharyngealCatheter, on_delete=models.SET_NULL,
                                                   null=True, blank=True, related_name="+")

    class Meta:
        verbose_name = "установка ларингеальной маски"
        verbose_name_plural = "установка ларингеальных масок"
        constraints = [models.UniqueConstraint(fields=["operation", "laryngeal_mask_type"],
                                               name="unique_mask_type_per_operation")]


class TubeMaskInstallation(models.Model):
    """Обеспечение проходимости и защиты верхних дыхательных путей."""

    class IntubationMethod(models.TextChoices):
        INTUBOSCOPY = "INTUBOSCOPY", "Интубоскопия"
        TRACHEOSTOMY = "TRACHEOSTOMY", "Трахеостомия"
        CONICOTOMY = "CONICOTOMY", "Коникотомия"

    operation = models.OneToOneField(OPERATION, on_delete=models.CASCADE, related_name="tube_mask_installation")
    tube_installed = models.BooleanField("трубка установлена", null=True)
    attempts = models.PositiveSmallIntegerField("количество попыток", null=True, blank=True)
    intubation_method = models.CharField("метод интубации", max_length=16, choices=IntubationMethod.choices,
                                         blank=True)
    # Структура JSON-полей валидируется сериализатором (см. protocol/serializers.py).
    laryngeal_tube = models.JSONField("пищеводный обтуратор", default=dict, blank=True)
    intubation_tube = models.JSONField("интубационная трубка", default=dict, blank=True)
    endobronchial_tube = models.JSONField("эндобронхиальная трубка", default=dict, blank=True)
    laryngoscopy = models.JSONField("ларингоскопия", default=dict, blank=True)
    sanacia = models.JSONField("санация", default=list, blank=True)

    class Meta:
        verbose_name = "проходимость дыхательных путей"
        verbose_name_plural = "проходимость дыхательных путей"


class RedirectingPatient(models.Model):
    """Направление пациента после операции."""

    operation = models.OneToOneField(OPERATION, on_delete=models.CASCADE, related_name="redirecting_patient")
    department_type = models.ForeignKey(catalogs.DepartmentType, on_delete=models.SET_NULL, null=True, blank=True)
    department = models.ForeignKey(catalogs.Department, on_delete=models.SET_NULL, null=True, blank=True)
    doctor_fio = models.CharField("ФИО принимающего врача", max_length=255, blank=True)

    class Meta:
        verbose_name = "направление пациента"
        verbose_name_plural = "направление пациента"


class Ventilator(models.Model):
    """Аппарат ИВЛ (НДА), мониторинг и примечание к протоколу."""

    operation = models.OneToOneField(OPERATION, on_delete=models.CASCADE, related_name="protocol_ventilator")
    ventilator = models.ForeignKey(catalogs.Ventilator, on_delete=models.SET_NULL, null=True, blank=True)
    monitoring = models.ForeignKey(catalogs.Monitoring, on_delete=models.SET_NULL, null=True, blank=True)
    patient_status = models.ForeignKey(catalogs.PatientStatus, on_delete=models.SET_NULL, null=True, blank=True)
    patient_status_value = models.PositiveSmallIntegerField(null=True, blank=True)
    chamber = models.PositiveIntegerField("палата", null=True, blank=True)
    bed = models.PositiveIntegerField("койка", null=True, blank=True)
    note = models.TextField("примечание", blank=True)

    class Meta:
        verbose_name = "аппарат ИВЛ (протокол)"
        verbose_name_plural = "аппарат ИВЛ (протокол)"


class MaintainingAnesthesia(models.Model):
    operation = models.OneToOneField(OPERATION, on_delete=models.CASCADE, related_name="maintaining_anesthesia")
    anesthesia_specificity = models.ForeignKey(catalogs.AnesthesiaSpecificity, on_delete=models.SET_NULL, null=True,
                                               blank=True)
    index_bis = models.FloatField("индекс BIS", null=True, blank=True)
    anesthesia_type = models.ForeignKey(catalogs.AnesthesiaType, on_delete=models.SET_NULL, null=True, blank=True)
    symptomatic_picked = models.BooleanField("симптоматическая терапия", null=True)
    symptomatic_option = models.TextField("симптоматическая терапия (описание)", blank=True)
    oropharyngeal_catheter = models.ForeignKey(catalogs.OropharyngealCatheter, on_delete=models.SET_NULL, null=True,
                                               blank=True)
    option_mg = models.PositiveIntegerField("доза, мг", null=True, blank=True)

    class Meta:
        verbose_name = "поддержание анестезии (протокол)"
        verbose_name_plural = "поддержание анестезии (протокол)"


class PatientTransferred(models.Model):
    """Пациент передан: состояние на начало транспортировки (b_*) и на момент передачи (t_*)."""

    operation = models.OneToOneField(OPERATION, on_delete=models.CASCADE, related_name="patient_transferred")

    b_time = models.TimeField(null=True, blank=True)
    b_ad = models.FloatField("АД (начало транспортировки)", null=True, blank=True)
    b_ps = models.FloatField(null=True, blank=True)
    b_spo2 = models.FloatField(null=True, blank=True)
    b_breath_rate = models.FloatField(null=True, blank=True)
    b_cvp = models.FloatField(null=True, blank=True)
    b_scale_meyo = models.JSONField(null=True, blank=True)
    b_scale_glazgo = models.JSONField(null=True, blank=True)

    t_time = models.TimeField(null=True, blank=True)
    t_ad = models.FloatField("АД (момент передачи)", null=True, blank=True)
    t_ps = models.FloatField(null=True, blank=True)
    t_spo2 = models.FloatField(null=True, blank=True)
    t_breath_rate = models.FloatField(null=True, blank=True)
    t_cvp = models.FloatField(null=True, blank=True)
    t_scale_meyo = models.JSONField(null=True, blank=True)
    t_scale_glazgo = models.JSONField(null=True, blank=True)

    atropine = models.FloatField("атропин, мг", null=True, blank=True)
    proserine = models.FloatField("прозерин, мг", null=True, blank=True)
    sugammadex = models.FloatField("сугаммадекс, мг", null=True, blank=True)
    is_decurarisation = models.BooleanField("декураризация", null=True)
    is_effective_breathing = models.BooleanField(null=True)
    is_regaining_consciousness = models.BooleanField(null=True)
    is_extubation = models.BooleanField(null=True)
    is_extended_ventilation = models.BooleanField("продлённая ИВЛ", null=True)
    is_died = models.BooleanField("летальный исход", null=True)
    effective_breathing = models.FloatField("восстановление дыхания через, мин", null=True, blank=True)
    regaining_consciousness = models.FloatField("восстановление сознания через, мин", null=True, blank=True)
    extubation = models.FloatField("экстубация через, мин", null=True, blank=True)

    class Meta:
        verbose_name = "передача пациента"
        verbose_name_plural = "передача пациента"
