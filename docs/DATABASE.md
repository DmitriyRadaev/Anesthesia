# Структура базы данных

СУБД — PostgreSQL 16. Схема создаётся миграциями Django (`python manage.py migrate`); справочники и медикаменты
загружаются data-миграциями `catalogs.0002_load_catalogs` и `medicaments.0002_load_medicaments`.
Идентификаторы справочников совпадают с исходной системой (это важно для правил: тип операции 1/2/3,
единицы измерения mg/mcg/ng, тип вены ПВК/ЦВК и т.д.).

## Основные связи

```
accounts_user ─┬─< operations_operation.doctor_id
               ├─< operations_operation.nurse_id
               └─< accounts_authtoken
patients_patient ─< operations_operation (PROTECT: пациента с ОС удалить нельзя)
operations_operation ─┬─ 1:1 protocol_* (сведения об анестезии, премедикация, проходимость ДП, ИВЛ,
                      │        поддержание, передача пациента, направление), labs_labresult
                      ├─< protocol_venousaccess, protocol_tubeinstallationpick, protocol_laryngealmaskinstallation
                      └─< card_* (действия, дыхание, этапы, препараты, инфузии, трансфузии, потери)
monitoring_hl7result ··· связь с ОС по значению operations_operation.pid (данные мониторов приходят раньше ОС)
```

Удаление ОС каскадно удаляет блоки протокола и карты (в API удаление ОС не предусмотрено).
Ссылки на справочники — `PROTECT` для обязательных, `SET NULL` для необязательных.

## Отличия от схемы исходной системы

| Было (Laravel) | Стало |
|----------------|-------|
| `users` + `users_info` + `users_roles` + `users_statuses` + `user_bars_ids`, `bars_token` | `accounts_user` (роль — поле с фиксированными значениями, статус — `is_active`), БАРС-поля удалены |
| `personal_access_tokens` (Sanctum, открытый токен) | `accounts_authtoken` (SHA-256 хеш, срок действия) |
| `operation_users` (M2M, роль определялась по пользователю) | `operations_operation.doctor_id`, `nurse_id` |
| `patients.patient_bars_id`, `operations.history_bars_id` | удалены |
| `operations.imt` | вычисляется (`bmi`) из роста и веса |
| `venous_access_pvc` + `venous_access_cvc` | `protocol_venousaccess` с полем `kind` (1 — ПВК, 2 — ЦВК) |
| `card_premedications` + `card_introduction_anesthesia` + `card_maintenance_anesthesia` (dose — строка) | `card_drugadministration` с полем `section`, `dose` — decimal, `injection_type` — BOLUS/INFUSION |
| `protocol_information_anesthesia.anesthesia_types` (JSON с копиями названий) | M2M на справочник методов анестезии |
| `_departments` без типа (фильтр по несуществующей колонке) | `catalogs_department.department_type_id` |
| `protocol_redirecting_patient` (расхождение миграции и модели) | `department_type_id`, `department_id`, `doctor_fio` |
| — | `labs_labresult` (лабораторный мониторинг теперь сохраняется) |


## Пользователи и авторизация

### `accounts_user` — пользователь

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `password` | CharField | пароль |
| `last_login` | DateTimeField NULL | последний вход |
| `is_superuser` | BooleanField | статус суперпользователя |
| `username` | CharField UNIQUE | логин |
| `surname` | CharField | фамилия |
| `firstname` | CharField | имя |
| `lastname` | CharField | отчество |
| `birthdate` | DateField NULL | дата рождения |
| `role` | PositiveSmallIntegerField значения: 1=Врач, 2=Медсестра/Медбрат, 3=Администратор, 4=Заведующий отделением, 5=ИО заведующего отделением | роль |
| `employee_code` | CharField | код сотрудника |
| `speciality` | CharField | специальность |
| `department` | CharField | отделение |
| `job_title` | CharField | должность |
| `is_active` | BooleanField | активен |
| `is_staff` | BooleanField | доступ к django-admin |
| `created_at` | DateTimeField | создан |
| `updated_at` | DateTimeField | изменён |
| `groups` | M2M → `auth_group` | группы |
| `user_permissions` | M2M → `auth_permission` | права пользователя |

### `accounts_authtoken` — токен доступа

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `user_id` | FK → `accounts_user` | пользователь |
| `key_hash` | CharField UNIQUE | хеш ключа |
| `created_at` | DateTimeField | создан |
| `expires_at` | DateTimeField NULL | истекает |
| `last_used_at` | DateTimeField NULL | последнее использование |


## Пациенты

### `patients_patient` — пациент

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `status` | PositiveSmallIntegerField значения: 1=Новая, 2=Активная, 3=Архивная | статус карточки |
| `surname` | CharField | фамилия |
| `firstname` | CharField | имя |
| `lastname` | CharField | отчество |
| `sex_id` | FK → `catalogs_sex` | пол |
| `birthdate` | DateField | дата рождения |
| `blood_group_id` | FK → `catalogs_bloodgroup` | группа крови |
| `blood_rh_id` | FK → `catalogs_bloodrh` | резус-фактор |
| `snils` | CharField | СНИЛС |
| `enp` | CharField | ЕНП (полис) |
| `created_at` | DateTimeField | создана |
| `updated_at` | DateTimeField | изменена |

Ограничение `unique_patient_identity`: уникальность (surname, firstname, lastname, birthdate, sex).


## Операционные случаи

### `operations_operation` — операционный случай

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `patient_id` | FK → `patients_patient` | пациент |
| `status` | PositiveSmallIntegerField значения: 1=Поступил, 2=На операции, 3=Завершён, 4=Отменён | статус |
| `operation_date` | DateField NULL | дата операции |
| `operation_time` | TimeField NULL | время поступления в операционную |
| `pid` | CharField | PID пациента в мониторах |
| `operation_name` | CharField | наименование операции |
| `operation_code` | CharField | код операции |
| `federal_code` | CharField | федеральный код |
| `diagnosis_id` | FK → `catalogs_diagnosis` NULL | диагноз (МКБ-10) |
| `diagnosis_name` | CharField | диагноз |
| `history_number` | CharField | номер истории болезни |
| `type_operation_id` | FK → `catalogs_typeoperation` | тип операции |
| `asa_id` | FK → `catalogs_asa` NULL | ASA |
| `volume_operation_id` | FK → `catalogs_volumeoperation` NULL | объём операции |
| `department_id` | FK → `catalogs_department` NULL | отделение |
| `ventilator_id` | FK → `catalogs_ventilator` NULL | аппарат ИВЛ |
| `monitoring_id` | FK → `catalogs_monitoring` NULL | монитор |
| `complaints_patient` | TextField | жалобы пациента |
| `features_anamnesis` | TextField | особенности анамнеза |
| `drug_intolerance` | TextField | непереносимость препаратов |
| `height` | DecimalField NULL | рост, см |
| `weight` | DecimalField NULL | вес, кг |
| `reason_cancel` | TextField | причина отмены |
| `doctor_id` | FK → `accounts_user` NULL | врач-анестезиолог |
| `nurse_id` | FK → `accounts_user` NULL | медсестра-анестезист |
| `created_at` | DateTimeField | создан |
| `updated_at` | DateTimeField | изменён |


## Протокол анестезии

### `protocol_informationanesthesia` — сведения об анестезии

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `patient_arrived` | BooleanField NULL | пациент доставлен, начат мониторинг, обеспечен венозный доступ |
| `anesthesia_methods` | M2M → `catalogs_anesthesiamethod` | методы анестезии |

### `protocol_venousaccess` — венозный доступ

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` | operation |
| `kind` | PositiveSmallIntegerField значения: 1=ПВК, 2=ЦВК | вид доступа |
| `vein_id` | FK → `catalogs_vein` | вена |
| `arm` | CharField значения: L=Левая, R=Правая | сторона |
| `catheter_type_id` | FK → `catalogs_cathetertype` NULL | тип катетера |
| `catheter_diameter_1_id` | FK → `catalogs_catheterdiameter` NULL | диаметр (просвет 1) |
| `catheter_diameter_2_id` | FK → `catalogs_catheterdiameter` NULL | диаметр (просвет 2) |
| `catheter_diameter_3_id` | FK → `catalogs_catheterdiameter` NULL | диаметр (просвет 3) |

### `protocol_premedication` — премедикация (протокол)

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `oxygen_mask_size_id` | FK → `catalogs_oxygenmasksize` NULL | размер кислородной маски |
| `is_oxygen_insufflation` | BooleanField NULL | инсуффляция кислорода |
| `pharynx_tamponade` | BooleanField NULL | тампонада глотки |
| `rass_id` | FK → `catalogs_rass` NULL | RASS |
| `note` | TextField | примечание |

### `protocol_tubeinstallationpick` — установка трубки

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` | operation |
| `tube_type_id` | FK → `catalogs_tubetype` | тип трубки |
| `option` | CharField | опция |
| `combi_tube_size_id` | FK → `catalogs_combitubesize` NULL | combi tube size |
| `intubation_tube_size_id` | FK → `catalogs_intubationtubesize` NULL | intubation tube size |
| `pressure_type_id` | FK → `catalogs_pressuretype` NULL | pressure type |
| `tube_installed` | BooleanField NULL | трубка установлена |
| `attempts` | PositiveSmallIntegerField NULL | количество попыток |

Ограничение `unique_tube_type_per_operation`: уникальность (operation, tube_type).

### `protocol_laryngealmaskinstallation` — установка ларингеальной маски

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` | operation |
| `laryngeal_mask_type_id` | FK → `catalogs_laryngealmasktype` | laryngeal mask type |
| `option` | CharField значения: DL=Ларингоскопия прямая, VL=Ларингоскопия изогнутым клинком, VP=Ларингоскопия клинком с подвижным наконечником, CON=Коникотомия, TRA=Трахеостомия, RG=Санация ротоглотки, TBD=Санация ТБД | опция |
| `option_ext` | CharField | доп. опция |
| `blade_type_id` | FK → `catalogs_bladetype` NULL | blade type |
| `blade_number_id` | FK → `catalogs_bladenumber` NULL | blade number |
| `tube_installed` | BooleanField NULL | tube installed |
| `attempts_number` | PositiveSmallIntegerField NULL | attempts number |
| `intuboscope_cuff_type_id` | FK → `catalogs_intuboscopecufftype` NULL | intuboscope cuff type |
| `intuboscope_cuff_size_id` | FK → `catalogs_intuboscopecuffsize` NULL | intuboscope cuff size |
| `oropharyngeal_catheter_id` | FK → `catalogs_oropharyngealcatheter` NULL | oropharyngeal catheter |
| `oropharyngeal_catheter_ext_id` | FK → `catalogs_oropharyngealcatheter` NULL | oropharyngeal catheter ext |

Ограничение `unique_mask_type_per_operation`: уникальность (operation, laryngeal_mask_type).

### `protocol_tubemaskinstallation` — проходимость дыхательных путей

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `tube_installed` | BooleanField NULL | трубка установлена |
| `attempts` | PositiveSmallIntegerField NULL | количество попыток |
| `intubation_method` | CharField значения: INTUBOSCOPY=Интубоскопия, TRACHEOSTOMY=Трахеостомия, CONICOTOMY=Коникотомия | метод интубации |
| `laryngeal_tube` | JSONField | пищеводный обтуратор |
| `intubation_tube` | JSONField | интубационная трубка |
| `endobronchial_tube` | JSONField | эндобронхиальная трубка |
| `laryngoscopy` | JSONField | ларингоскопия |
| `sanacia` | JSONField | санация |

### `protocol_redirectingpatient` — направление пациента

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `department_type_id` | FK → `catalogs_departmenttype` NULL | department type |
| `department_id` | FK → `catalogs_department` NULL | department |
| `doctor_fio` | CharField | ФИО принимающего врача |

### `protocol_ventilator` — аппарат ИВЛ (протокол)

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `ventilator_id` | FK → `catalogs_ventilator` NULL | ventilator |
| `monitoring_id` | FK → `catalogs_monitoring` NULL | monitoring |
| `patient_status_id` | FK → `catalogs_patientstatus` NULL | patient status |
| `patient_status_value` | PositiveSmallIntegerField NULL | patient status value |
| `chamber` | PositiveIntegerField NULL | палата |
| `bed` | PositiveIntegerField NULL | койка |
| `note` | TextField | примечание |

### `protocol_maintaininganesthesia` — поддержание анестезии (протокол)

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `anesthesia_specificity_id` | FK → `catalogs_anesthesiaspecificity` NULL | anesthesia specificity |
| `index_bis` | FloatField NULL | индекс BIS |
| `anesthesia_type_id` | FK → `catalogs_anesthesiatype` NULL | anesthesia type |
| `symptomatic_picked` | BooleanField NULL | симптоматическая терапия |
| `symptomatic_option` | TextField | симптоматическая терапия (описание) |
| `oropharyngeal_catheter_id` | FK → `catalogs_oropharyngealcatheter` NULL | oropharyngeal catheter |
| `option_mg` | PositiveIntegerField NULL | доза, мг |

### `protocol_patienttransferred` — передача пациента

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `b_time` | TimeField NULL | b time |
| `b_ad` | FloatField NULL | АД (начало транспортировки) |
| `b_ps` | FloatField NULL | b ps |
| `b_spo2` | FloatField NULL | b spo2 |
| `b_breath_rate` | FloatField NULL | b breath rate |
| `b_cvp` | FloatField NULL | b cvp |
| `b_scale_meyo` | JSONField NULL | b scale meyo |
| `b_scale_glazgo` | JSONField NULL | b scale glazgo |
| `t_time` | TimeField NULL | t time |
| `t_ad` | FloatField NULL | АД (момент передачи) |
| `t_ps` | FloatField NULL | t ps |
| `t_spo2` | FloatField NULL | t spo2 |
| `t_breath_rate` | FloatField NULL | t breath rate |
| `t_cvp` | FloatField NULL | t cvp |
| `t_scale_meyo` | JSONField NULL | t scale meyo |
| `t_scale_glazgo` | JSONField NULL | t scale glazgo |
| `atropine` | FloatField NULL | атропин, мг |
| `proserine` | FloatField NULL | прозерин, мг |
| `sugammadex` | FloatField NULL | сугаммадекс, мг |
| `is_decurarisation` | BooleanField NULL | декураризация |
| `is_effective_breathing` | BooleanField NULL | is effective breathing |
| `is_regaining_consciousness` | BooleanField NULL | is regaining consciousness |
| `is_extubation` | BooleanField NULL | is extubation |
| `is_extended_ventilation` | BooleanField NULL | продлённая ИВЛ |
| `is_died` | BooleanField NULL | летальный исход |
| `effective_breathing` | FloatField NULL | восстановление дыхания через, мин |
| `regaining_consciousness` | FloatField NULL | восстановление сознания через, мин |
| `extubation` | FloatField NULL | экстубация через, мин |


## Наркозная карта

### `card_anestheticaction` — анестезиологическое действие

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` | operation |
| `time` | DateTimeField | время |
| `value` | CharField значения: ANESTHESIA_START=Начало анестезии, ANESTHESIA_STOP=Окончание анестезии, INTUBATION=Интубация трахеи, EXTUBATION=Экстубация трахеи, PREMEDICATION=Премедикация, INTRODUCTION=Вводный наркоз, TURN=Поворот, DECURARISATION=Декураризация, BLOCKADE=Блокада, OPERATION_START=Начало операции, OPERATION_STOP=Окончание операции, INFUSION_START=Начало инфузии, INFUSION_STOP=Окончание инфузии, SPONTANEOUS=Самостоятельное дыхание, SUPPORTIVE=Вспомогательное дыхание, FORCED=Принудительное дыхание | действие |

### `card_breathcharacteristic` — интервал характеристики дыхания

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` | operation |
| `breath_type` | CharField значения: spontaneous=Самостоятельное, supportive=Вспомогательное, forced=Принудительное | тип дыхания |
| `time_start` | DateTimeField | начало |
| `time_end` | DateTimeField | окончание |

### `card_operationstage` — этап операции

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` | operation |
| `stage` | PositiveSmallIntegerField | этап |
| `time_start` | DateTimeField NULL | время |
| `description` | CharField | описание |

Ограничение `unique_operation_stage`: уникальность (operation, stage).

### `card_drugadministration` — введение препарата

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` | operation |
| `section` | CharField значения: premedication=Премедикация, introduction=Введение в анестезию, maintenance=Поддержание анестезии | раздел |
| `drug` | CharField | препарат |
| `injection_type` | CharField значения: BOLUS=Болюсное, INFUSION=Инфузионное | способ введения |
| `measurement_unit_id` | FK → `catalogs_measurementunit` | ед. измерения |
| `dose` | DecimalField | доза |
| `time_start` | DateTimeField NULL | время введения/начала |
| `time_end` | DateTimeField NULL | окончание |

### `card_infusion` — инфузия

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `time_start` | DateTimeField NULL | начало |
| `time_end` | DateTimeField NULL | окончание |
| `operation_id` | FK → `operations_operation` | operation |
| `solution` | CharField | раствор |
| `dose` | DecimalField | объём, мл |

### `card_transfusion` — трансфузия

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `time_start` | DateTimeField NULL | начало |
| `time_end` | DateTimeField NULL | окончание |
| `operation_id` | FK → `operations_operation` | operation |
| `solution` | CharField | компонент крови |
| `gemakon` | CharField | гемакон (номер/объём) |

### `card_liquid` — жидкостные потери

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `time_start` | DateTimeField NULL | начало |
| `time_end` | DateTimeField NULL | окончание |
| `operation_id` | FK → `operations_operation` | operation |
| `liquid` | CharField | вид потерь |
| `volume` | DecimalField | объём, мл |


## Мониторинг (HL7)

### `monitoring_hl7result` — результат HL7

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `observation_at` | DateTimeField | время измерения |
| `pid` | CharField | PID пациента |
| `order_number` | CharField | номер заказа |
| `department` | CharField | отделение |
| `room` | CharField | палата |
| `bed` | CharField | койка |
| `device` | CharField | устройство |
| `observations` | JSONField | показатели |
| `created_at` | DateTimeField | created at |

Ограничение `unique_hl7_observation`: уникальность (observation_at, pid, order_number).


## Лабораторный мониторинг

### `labs_labresult` — лабораторный мониторинг

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `operation_id` | FK → `operations_operation` (1:1) UNIQUE | operation |
| `values` | JSONField | показатели |
| `updated_at` | DateTimeField | изменено |
| `updated_by_id` | FK → `accounts_user` NULL | изменил |


## Медикаменты

### `medicaments_medicamentgroup` — группа медикаментов

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `name` | CharField | наименование |

### `medicaments_medicament` — медикамент

| Поле | Тип | Описание |
|---|---|---|
| `id` | BigAutoField | ID |
| `name` | CharField | наименование |
| `group_id` | FK → `medicaments_medicamentgroup` | группа |

Ограничение `unique_medicament_name`: уникальность (name).


## Справочники

Все справочники имеют поля `id`, `name` (наименование), `code`, `description`. Дополнительные поля:

| Таблица | Справочник | Доп. поля | Записей |
|---|---|---|---|
| `catalogs_anesthesiamethod` | методы анестезии | type | 9 |
| `catalogs_anesthesiaspecificity` | особенности анестезии | — | 2 |
| `catalogs_anesthesiatype` | виды анестезии | — | 4 |
| `catalogs_asa` | классы ASA | — | 6 |
| `catalogs_bladenumber` | номера клинков | — | 5 |
| `catalogs_bladetype` | типы клинков | — | 2 |
| `catalogs_bloodgroup` | группы крови | — | 7 |
| `catalogs_bloodrh` | резус-факторы | — | 3 |
| `catalogs_catheterdiameter` | диаметры катетеров | — | 8 |
| `catalogs_cathetertype` | типы катетеров | — | 3 |
| `catalogs_combitubesize` | размеры CombiTube | — | 2 |
| `catalogs_departmenttype` | типы отделений | — | 4 |
| `catalogs_department` | отделения | department_type → `catalogs_departmenttype` | 11 |
| `catalogs_departmentname` | наименования отделений | — | 3 |
| `catalogs_departmentpicked` | направления перевода | — | 5 |
| `catalogs_diagnosis` | диагнозы (МКБ-10) | — | 5 |
| `catalogs_intubationtubesize` | размеры интубационных трубок | — | 16 |
| `catalogs_intuboscopecuffsize` | диаметры манжет | — | 12 |
| `catalogs_intuboscopecufftype` | типы манжет | — | 2 |
| `catalogs_laryngealmasktype` | типы ларингеальных масок | — | 3 |
| `catalogs_measurementunit` | единицы измерения | — | 7 |
| `catalogs_monitoring` | мониторы | — | 10 |
| `catalogs_oropharyngealcatheter` | орофарингеальные катетеры | — | 2 |
| `catalogs_oxygenmasksize` | размеры кислородных масок | — | 5 |
| `catalogs_patientstatus` | статусы пациента (ИВЛ) | — | 5 |
| `catalogs_pressuretype` | типы давления | — | 2 |
| `catalogs_rass` | шкала RASS | value | 10 |
| `catalogs_scaleglazgohead` | разделы шкалы Глазго | — | 3 |
| `catalogs_scaleglazgo` | шкала Глазго | head → `catalogs_scaleglazgohead`, value | 15 |
| `catalogs_scalemeyohead` | разделы шкалы Мейо (FOUR) | — | 4 |
| `catalogs_scalemeyo` | шкала Мейо (FOUR) | head → `catalogs_scalemeyohead`, value | 20 |
| `catalogs_sex` | пол | — | 2 |
| `catalogs_tubetype` | типы трубок | — | 4 |
| `catalogs_typeoperation` | типы операций | — | 3 |
| `catalogs_vein` | вены | type | 7 |
| `catalogs_ventilator` | аппараты ИВЛ | — | 3 |
| `catalogs_volumeoperation` | объёмы операций | — | 4 |
