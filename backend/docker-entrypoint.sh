#!/bin/sh
set -e

# Ожидание готовности PostgreSQL.
python - <<'PY'
import os, time
import psycopg

for attempt in range(60):
    try:
        psycopg.connect(
            host=os.environ.get("POSTGRES_HOST", "db"), port=os.environ.get("POSTGRES_PORT", "5432"),
            dbname=os.environ.get("POSTGRES_DB"), user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"), connect_timeout=3,
        ).close()
        break
    except psycopg.OperationalError:
        print("Ожидание PostgreSQL...", flush=True)
        time.sleep(2)
else:
    raise SystemExit("PostgreSQL недоступен")
PY

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    python manage.py migrate --noinput
    # Первый администратор создаётся, только если задан DJANGO_ADMIN_PASSWORD (иначе — вручную командой create_admin).
    python manage.py create_admin --if-missing
fi

exec "$@"
