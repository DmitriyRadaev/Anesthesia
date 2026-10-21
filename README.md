# АРМ Анестезиология (Django REST Framework + React)

Система ведения **протокола анестезии** и **наркозной карты** операционного случая: реестр пациентов,
операционные случаи (ОС), протокол, наркозная карта с временной шкалой, показатели мониторов (HL7),
лабораторный мониторинг, печатные формы, отчёт 41.10 и администрирование пользователей.

Проект — миграция системы «Ядро» (PHP/Laravel + React/MobX) на стек:

| Слой | Технологии |
|------|-----------|
| Backend | Python 3.12, Django 5.1, Django REST Framework 3.15, drf-spectacular (OpenAPI/Swagger), django-filter |
| БД | PostgreSQL 16 |
| Frontend | React 18, TypeScript 5, Vite 5, Tailwind CSS 3, TanStack Query, Chart.js |
| Тесты | pytest + pytest-django (PostgreSQL), Vitest + Testing Library |
| Инфраструктура | Docker Compose (PostgreSQL, backend/gunicorn, frontend/nginx, приёмник HL7) |

Интеграция с МИС **БАРС удалена полностью**: авторизация локальная, пользователи и пациенты ведутся в системе.

Документация:

* [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md) — план миграции, соответствие компонентов, противоречия и решения;
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — архитектура и бизнес-процессы;
* [docs/DATABASE.md](docs/DATABASE.md) — структура базы данных;
* [docs/AUTH.md](docs/AUTH.md) — авторизация, роли и матрица прав;
* [docs/API.md](docs/API.md) — обзор API и соответствие старым endpoints; [docs/openapi.yaml](docs/openapi.yaml) — схема OpenAPI;
* [postman/](postman/) — коллекция и окружение Postman.

---

## Быстрый старт в Docker

```bash
cp .env.example .env
# отредактируйте .env: DJANGO_SECRET_KEY, POSTGRES_PASSWORD, DJANGO_ADMIN_PASSWORD (пароль первого администратора)
docker compose up -d --build
```

* Приложение: http://localhost:8080
* Swagger UI: http://localhost:8080/api/docs/ (также http://localhost:8000/api/docs/), ReDoc: `/api/redoc/`
* Django admin (для суперпользователя): http://localhost:8080/django-admin/

При старте контейнер backend ждёт PostgreSQL, применяет миграции (включая загрузку справочников и медикаментов)
и создаёт администратора `DJANGO_ADMIN_USERNAME`, если задан `DJANGO_ADMIN_PASSWORD`. После первого входа
удалите `DJANGO_ADMIN_PASSWORD` из `.env`.

Приёмник HL7 от шлюза мониторов (порт 6112): `docker compose --profile hl7 up -d`.

## Локальная разработка без Docker

Требования: Python 3.12, Node.js 20+, PostgreSQL 14+ (с UTF-8 локалью — от неё зависит регистронезависимый поиск по кириллице).

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows;  source .venv/bin/activate — Linux/macOS
pip install -r requirements-dev.txt
cp ../.env.example .env           # укажите DJANGO_DEBUG=1 и параметры PostgreSQL (POSTGRES_HOST/PORT/...)
python manage.py migrate
python manage.py create_admin --username admin   # пароль будет запрошен интерактивно
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173, запросы /api проксируются на http://localhost:8000
```

Адрес backend для dev-сервера меняется переменной `VITE_API_PROXY`; для сборки без прокси — `VITE_API_URL`.

## Пользователи и первичные данные

| Команда | Назначение |
|---------|-----------|
| `python manage.py create_admin [--username admin] [--password-env VAR] [--if-missing] [--superuser]` | Первый администратор. Пароль — из переменной окружения или интерактивно (в аргументах не передаётся), проверяется валидаторами Django |
| `python manage.py load_users path/to/users.json [--update]` | Заранее подготовленные пользователи из JSON. Пароль можно не указывать — будет сгенерирован и показан однократно. Пример: [backend/data/users.example.json](backend/data/users.example.json) |
| `python manage.py import_medicaments [file.xlsx] [--replace]` | Обновление справочника медикаментов из Excel (по умолчанию `backend/data/medicaments.xlsx`) |
| `python manage.py seed_demo [--reset]` | Демонстрационные пациенты, ОС, заполненные протокол/карта и синтетические показатели мониторов (требуются активные врач и медсестра). Только для ознакомления |
| `python manage.py hl7_listener [--host 0.0.0.0] [--port 6112]` | TCP-приёмник HL7 (MLLP) от eGateway |

Справочники (37 шт.) и медикаменты загружаются **data-миграциями** — после `migrate` система сразу готова к работе.

Дальнейшее управление пользователями — в интерфейсе: **Пользователи** (роли «Администратор», «Заведующий», «ИО заведующего»):
создание с паролем, назначение роли, активация/деактивация, смена пароля.

## Тесты

```bash
# backend: 120 тестов на PostgreSQL (тестовая БД создаётся автоматически, пользователю БД нужно право CREATEDB)
cd backend
pytest                       # быстрый прогон с переиспользованием тестовой БД
pytest --create-db --cov=apps --cov-report=term-missing
ruff check .                 # линтер

# frontend: 35 тестов компонентов и сценариев (Vitest + Testing Library, jsdom)
cd frontend
npm test
npm run typecheck
npm run build
```

В Docker: `docker compose run --rm backend sh -c "pip install -r requirements-dev.txt && pytest --create-db"`.

## Postman

1. Импортируйте `postman/anesthesia.postman_collection.json` и `postman/anesthesia.postman_environment.json`.
2. В окружении задайте `username`/`password` (пользователь с ролью «Заведующий») и `adminUsername`/`adminPassword`.
3. Запустите коллекцию целиком (Runner): папки упорядочены как сквозной сценарий, токены и id сохраняются
   в переменные автоматически. Примеры ответов в коллекции — реальные ответы API.

Коллекция пересобирается скриптом `postman/build_collection.py` против работающего backend (см. docstring) —
так она всегда соответствует фактическому API.

## Структура репозитория

```
backend/
  config/            настройки (переменные окружения), URL
  apps/
    accounts/        пользователи, роли, токены, вход/выход, команды create_admin/load_users
    catalogs/        37 справочников + реестр slug → модель, data-миграция
    patients/        карточки пациентов, реестр
    operations/      операционные случаи, бизнес-правила статусов, базовые вложенные представления
    protocol/        блоки протокола анестезии, печатная форма
    card/            наркозная карта: действия, дыхание, этапы, препараты, инфузии, ЦМС, печатная форма
    monitoring/      HL7: модель результатов, парсер, TCP-приёмник, графики, СППВР
    labs/            лабораторный мониторинг
    medicaments/     справочник медикаментов, импорт из Excel
    reports/         отчёт 41.10 (Excel/JSON)
    common/          формат ошибок, пагинация, фильтры, health-check, seed_demo
  data/              JSON-фикстуры справочников, medicaments.xlsx, пример users.json
frontend/
  src/api            HTTP-клиент, типы, функции endpoints
  src/auth           контекст авторизации, защищённые маршруты, роли
  src/components     UI-компоненты (Tailwind), layout
  src/pages          страницы: реестр, формы, протокол, наркозная карта, графики, лаборатория, отчёты, админка
  src/test           тесты Vitest
postman/             коллекция, окружение, генератор коллекции
docs/                документация, OpenAPI
docker-compose.yml
```

## Известные ограничения

См. раздел «Ограничения» в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#ограничения).
