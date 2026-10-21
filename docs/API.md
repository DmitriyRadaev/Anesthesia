# REST API

* Базовый путь: `/api/`. Формат — JSON (UTF-8), даты `YYYY-MM-DD`, время с часовым поясом ISO 8601
  (часовой пояс учреждения — `TIME_ZONE`, по умолчанию Europe/Samara).
* Авторизация: `Authorization: Bearer <token>` (см. [AUTH.md](AUTH.md)).
* Документация из кода: Swagger UI — `/api/docs/`, ReDoc — `/api/redoc/`, схема OpenAPI 3 — `/api/schema/`
  (выгрузка: [openapi.yaml](openapi.yaml), команда `python manage.py spectacular --file docs/openapi.yaml`).
* Коллекция Postman с реальными примерами ответов: [../postman](../postman).

## Соглашения

| Аспект | Правило |
|--------|---------|
| Списки | Пагинация `?page=N&page_size=M` (по умолчанию 20, максимум 100): `{"count", "next", "previous", "results"}` |
| Поиск / фильтры / сортировка | `?search=...`, поля фильтров, `?ordering=поле` / `-поле` (см. описание endpoint) |
| Множественные значения | `?status=1&status=2` или `?status=1,2`; пустое значение игнорируется |
| Блоки ОС «1:1» | `GET` (пустая форма, если не заполнен), `PUT` (полная замена), `PATCH` (частично) |
| Наборы строк ОС | `GET`, `PUT` — полная замена набора в транзакции |
| Ошибки | `{"detail": "…", "code": "…", "errors": {"поле": ["…"]}}`; вложенные ошибки — по путям (`"0.items.1.dose"`) |

| Код | Когда |
|-----|------|
| 200 / 201 / 204 | успех / создано / без тела (выход, удаление, смена пароля) |
| 400 | ошибка валидации |
| 401 | нет токена, токен недействителен/истёк, неверный пароль при входе |
| 403 | недостаточно прав роли, учётная запись деактивирована |
| 404 | объект не найден |
| 405 | метод не поддерживается (например, удаление ОС или пользователя) |
| 409 | нарушение бизнес-правила (отмена после начала анестезии, архив при активном ОС, дубликат ОС и т.п.) |
| 429 | превышен лимит запросов (вход, СППВР) |

## Соответствие маршрутам исходной системы

| Исходная система (Laravel) | Новый API |
|----------------------------|-----------|
| `POST /api/login` (через БАРС) | `POST /api/auth/login/` (локальная проверка пароля) |
| `PUT /api/session_bars_prolongation` | удалён (БАРС) — срок токена задаётся `AUTH_TOKEN_TTL_HOURS` |
| — | `POST /api/auth/logout/`, `GET /api/auth/me/`, `POST /api/auth/change-password/` |
| `GET /api/users`, `GET /api/users/{id}` | `GET /api/users/`, `GET /api/users/{id}/` (фильтры, поиск, пагинация) |
| `POST /api/users` `{sysuser}` (из БАРС) | `POST /api/users/` (логин, пароль, ФИО, роль) |
| `PATCH /api/users/{id}` `{user_status_id, user_role_id}` | `PATCH /api/users/{id}/` `{is_active, role, …}`, `POST /api/users/{id}/set-password/` |
| `GET /api/users/role`, `/api/users/status` | `GET /api/users/roles/`; статус — поле `is_active` |
| `POST /api/users/search`, `/search_fio`, `/doctors/search-doctors-bars` | удалены (БАРС); ФИО врачей — `GET /api/catalogs/doctor_fio/` |
| `GET /api/medical_staffs` | `GET /api/users/medical-staff/` |
| `POST /api/patients/search` (БАРС) | удалён; поиск по реестру — `GET /api/patients/?search_surname=` |
| `GET /api/patients_list?status&user=auth&search_surname` | `GET /api/patients/?status&mine=true&search_surname` |
| `GET/POST/PATCH/DELETE /api/patients[/{id}]` | `/api/patients/[{id}/]` |
| `GET /api/patients/status/to_archive/{id}` | `POST /api/patients/{id}/archive/` |
| `GET /api/patients/status/from_archive/{id}` | `POST /api/patients/{id}/unarchive/` |
| `GET/POST/PATCH /api/operations[/{id}]`, `GET /api/operations_show/{id}` | `/api/operations/[{id}/]` |
| `GET /api/operations_list[/{patient}]` | `GET /api/operations/?patient=&status=&mine=` |
| `PUT /api/operations/cancel/{id}` | `POST /api/operations/{id}/cancel/` |
| `PUT /api/operations/set_finished/{id}` | `POST /api/operations/{id}/finish/` |
| `GET/PATCH /api/operations/medical_staffs/{id}` | поля `doctor`/`nurse` в `GET/PATCH /api/operations/{id}/` |
| `GET/PATCH /api/protocol/<блок>/{operation_id}` | `GET/PUT/PATCH /api/operations/{id}/protocol/<блок>/` |
| `…/protocol/tube_mask_installation/{id}` | `…/protocol/airway/` |
| `…/protocol/venous_access_pvc/{id}`, `…/venous_access_cvc/{id}` | `…/protocol/venous-access/pvc/`, `…/venous-access/cvc/` |
| `GET /api/protocol/pdf/{id}` | `GET /api/operations/{id}/protocol/print/` |
| `GET/PATCH /api/card/<блок>/{operation_id}` | `GET/PUT/PATCH /api/operations/{id}/card/<блок>/` |
| `…/card/premedications, introduction_anesthesia, maintenance_anesthesia/{id}` | `…/card/drugs/{premedication, introduction, maintenance}/` |
| `…/card/anesthetic_actions/{id}`, `…/breath_characteristics/{id}`, `…/operation_stages/{id}` | `…/card/actions/`, `…/card/breath/`, `…/card/stages/` |
| `PATCH /api/card/pid_date_time/{id}` | `PATCH /api/operations/{id}/card/pid-datetime/` |
| `GET /api/card/pdf/get1block, get4block, get5block/{id}` | `GET /api/operations/{id}/card/print/` (общий ответ) |
| `GET /api/card/cms/{id}` | `GET /api/operations/{id}/card/cms/` |
| `POST /api/hl7/result` | `GET /api/operations/{id}/monitoring/results/?date_start=&date_end=` |
| `POST /api/hl7/get_unique_pids` | `GET /api/monitoring/pids/?minutes=10` |
| `POST /api/hl7/update_pid` | `PATCH /api/operations/{id}/card/pid-datetime/` |
| `GET /api/cdss/result/{id}` (без авторизации) | `GET /api/cdss/result/{id}/` (токен или `X-API-Key`) |
| `GET /api/get_high_result_socket/{id}` | удалён (заглушка в исходной системе) |
| `GET /api/medicaments/search?search_name=` | `GET /api/medicaments/?search_name=` |
| `GET /api/catalogs/<slug>` | `GET /api/catalogs/<slug>/`; перечень — `GET /api/catalogs/` |
| `GET /api/excel/report_4110?data_start&data_end` | `GET /api/reports/4110/?date_start&date_end` (+ `/data/` — JSON) |
| — | `GET/PUT /api/operations/{id}/labs/`, `GET …/labs/schema/` (лабораторный мониторинг) |
| — | `POST /api/monitoring/hl7/` (приём HL7 по HTTP), `GET /api/health/` |

Ответы больше не оборачиваются в `{"status", "message", "data"}`: объект возвращается напрямую, списки — с пагинацией.

## Перечень endpoints

### Авторизация

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/change-password/` | Смена собственного пароля |
| POST | `/api/auth/login/` | Вход в систему |
| POST | `/api/auth/logout/` | Выход (отзыв текущего токена) |
| GET | `/api/auth/me/` | Текущий пользователь |

### Справочники

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/catalogs/` | Перечень доступных справочников |
| GET | `/api/catalogs/{slug}/` | Элементы справочника |

### Мониторинг (HL7)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/cdss/result/{operation_id}/` | Последние показатели пациента для СППВР (CDSS) |
| POST | `/api/monitoring/hl7/` | Принять HL7-сообщение (ORU^R01) |
| GET | `/api/monitoring/pids/` | PID, от которых поступали данные за последние N минут (по умолчанию 10) |
| GET | `/api/operations/{operation_id}/monitoring/results/` | Показатели мониторов по ОС (для графиков) |

### Служебное

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/health/` | Проверка работоспособности (API + БД) |

### Медикаменты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/medicaments/` | Поиск медикаментов |
| GET | `/api/medicaments/{id}/` | Медикамент |

### Операционные случаи

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/operations/` | Список операционных случаев (фильтры, поиск, сортировка, пагинация) |
| POST | `/api/operations/` | Создать операционный случай |
| GET | `/api/operations/{id}/` | Операционный случай (полная информация) |
| PUT | `/api/operations/{id}/` | Изменить операционный случай |
| PATCH | `/api/operations/{id}/` | Частично изменить операционный случай |
| POST | `/api/operations/{id}/cancel/` | Отменить операционный случай |
| POST | `/api/operations/{id}/finish/` | Завершить операционный случай (требуется «Окончание анестезии») |

### Наркозная карта

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/operations/{operation_id}/card/actions/` | Анестезиологические действия |
| PUT | `/api/operations/{operation_id}/card/actions/` | Заменить анестезиологические действия |
| GET | `/api/operations/{operation_id}/card/breath/` | Характеристики дыхания |
| PUT | `/api/operations/{operation_id}/card/breath/` | Заменить характеристики дыхания |
| GET | `/api/operations/{operation_id}/card/cms/` | Показатели мониторов для блока ЦМС (интервалы по 5 минут) |
| GET | `/api/operations/{operation_id}/card/drugs/{section}/` | Препараты раздела |
| PUT | `/api/operations/{operation_id}/card/drugs/{section}/` | Заменить препараты раздела |
| GET | `/api/operations/{operation_id}/card/drugs/totals/` | Итоговые дозы препаратов (по всем разделам) |
| GET | `/api/operations/{operation_id}/card/infusions/` | Инфузионная терапия |
| PUT | `/api/operations/{operation_id}/card/infusions/` | Заменить инфузионную терапию |
| GET | `/api/operations/{operation_id}/card/liquids/` | Жидкостные потери |
| PUT | `/api/operations/{operation_id}/card/liquids/` | Заменить жидкостные потери |
| GET | `/api/operations/{operation_id}/card/patient-info/` | Сведения о пациенте и операции в наркозной карте |
| PATCH | `/api/operations/{operation_id}/card/patient-info/` | Изменить сведения о пациенте и операции в наркозной карте |
| PATCH | `/api/operations/{operation_id}/card/pid-datetime/` | Изменить PID, дату операции и время поступления (`null` — сбросить дату/время) |
| GET | `/api/operations/{operation_id}/card/print/` | Данные для печатной формы наркозной карты |
| GET | `/api/operations/{operation_id}/card/stages/` | Этапы операции (6 этапов) |
| PUT | `/api/operations/{operation_id}/card/stages/` | Изменить этапы операции |
| GET | `/api/operations/{operation_id}/card/transfusions/` | Трансфузионная терапия |
| PUT | `/api/operations/{operation_id}/card/transfusions/` | Заменить трансфузионную терапию |

### Лабораторный мониторинг

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/operations/{operation_id}/labs/` | Результаты лабораторного мониторинга |
| PUT | `/api/operations/{operation_id}/labs/` | Сохранить результаты лабораторного мониторинга |
| GET | `/api/operations/{operation_id}/labs/schema/` | Структура формы лабораторного мониторинга |

### Протокол анестезии

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/operations/{operation_id}/protocol/airway/` | Обеспечение проходимости дыхательных путей |
| PUT | `/api/operations/{operation_id}/protocol/airway/` | Обеспечение проходимости дыхательных путей: полная замена |
| PATCH | `/api/operations/{operation_id}/protocol/airway/` | Обеспечение проходимости дыхательных путей: частичное изменение |
| GET | `/api/operations/{operation_id}/protocol/information-anesthesia/` | Сведения об анестезии |
| PUT | `/api/operations/{operation_id}/protocol/information-anesthesia/` | Сведения об анестезии: полная замена |
| PATCH | `/api/operations/{operation_id}/protocol/information-anesthesia/` | Сведения об анестезии: частичное изменение |
| GET | `/api/operations/{operation_id}/protocol/laryngeal-masks/` | Установка ларингеальных масок |
| PUT | `/api/operations/{operation_id}/protocol/laryngeal-masks/` | Установка ларингеальных масок: заменить набор |
| GET | `/api/operations/{operation_id}/protocol/maintaining-anesthesia/` | Поддержание анестезии |
| PUT | `/api/operations/{operation_id}/protocol/maintaining-anesthesia/` | Поддержание анестезии: полная замена |
| PATCH | `/api/operations/{operation_id}/protocol/maintaining-anesthesia/` | Поддержание анестезии: частичное изменение |
| GET | `/api/operations/{operation_id}/protocol/patient-info/` | Сведения о пациенте в протоколе |
| PATCH | `/api/operations/{operation_id}/protocol/patient-info/` | Изменить жалобы, анамнез, рост и вес |
| GET | `/api/operations/{operation_id}/protocol/patient-transferred/` | Пациент передан |
| PUT | `/api/operations/{operation_id}/protocol/patient-transferred/` | Пациент передан: полная замена |
| PATCH | `/api/operations/{operation_id}/protocol/patient-transferred/` | Пациент передан: частичное изменение |
| GET | `/api/operations/{operation_id}/protocol/premedication/` | Премедикация |
| PUT | `/api/operations/{operation_id}/protocol/premedication/` | Премедикация: полная замена |
| PATCH | `/api/operations/{operation_id}/protocol/premedication/` | Премедикация: частичное изменение |
| GET | `/api/operations/{operation_id}/protocol/print/` | Данные для печатной формы протокола анестезии |
| GET | `/api/operations/{operation_id}/protocol/redirecting-patient/` | Направление пациента |
| PUT | `/api/operations/{operation_id}/protocol/redirecting-patient/` | Направление пациента: полная замена |
| PATCH | `/api/operations/{operation_id}/protocol/redirecting-patient/` | Направление пациента: частичное изменение |
| GET | `/api/operations/{operation_id}/protocol/tube-installations/` | Установка трубок |
| PUT | `/api/operations/{operation_id}/protocol/tube-installations/` | Установка трубок: заменить набор |
| GET | `/api/operations/{operation_id}/protocol/venous-access/cvc/` | Венозный доступ ЦВК |
| PUT | `/api/operations/{operation_id}/protocol/venous-access/cvc/` | Венозный доступ ЦВК: заменить набор |
| GET | `/api/operations/{operation_id}/protocol/venous-access/pvc/` | Венозный доступ ПВК |
| PUT | `/api/operations/{operation_id}/protocol/venous-access/pvc/` | Венозный доступ ПВК: заменить набор |
| GET | `/api/operations/{operation_id}/protocol/ventilator/` | Аппарат ИВЛ (НДА) и мониторинг |
| PUT | `/api/operations/{operation_id}/protocol/ventilator/` | Аппарат ИВЛ (НДА) и мониторинг: полная замена |
| PATCH | `/api/operations/{operation_id}/protocol/ventilator/` | Аппарат ИВЛ (НДА) и мониторинг: частичное изменение |

### Пациенты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/patients/` | Реестр пациентов |
| POST | `/api/patients/` | Создать карточку пациента |
| GET | `/api/patients/{id}/` | Карточка пациента |
| PUT | `/api/patients/{id}/` | Изменить карточку пациента |
| PATCH | `/api/patients/{id}/` | Частично изменить карточку пациента |
| DELETE | `/api/patients/{id}/` | Удалить карточку пациента (только без ОС; заведующий/ИО) |
| POST | `/api/patients/{id}/archive/` | Перевести карточку в архив |
| POST | `/api/patients/{id}/unarchive/` | Вернуть карточку из архива (статус «Активная») |

### Отчёты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/reports/4110/` | Отчёт 41.10 — файл Excel |
| GET | `/api/reports/4110/data/` | Отчёт 41.10 — данные (JSON) |

### Пользователи

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/users/` | Список пользователей (поиск, фильтры, сортировка, пагинация) |
| POST | `/api/users/` | Создать пользователя |
| GET | `/api/users/{id}/` | Пользователь |
| PUT | `/api/users/{id}/` | Изменить пользователя |
| PATCH | `/api/users/{id}/` | Частично изменить пользователя (роль, активность, профиль) |
| POST | `/api/users/{id}/set-password/` | Установить пароль пользователю |
| GET | `/api/users/medical-staff/` | Медицинский персонал (активные врачи и медсёстры) |
| GET | `/api/users/roles/` | Справочник ролей |
