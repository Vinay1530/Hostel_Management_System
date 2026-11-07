#!/bin/sh
set -e

# Wait until the database accepts connections (compose healthcheck helps, but
# this keeps standalone `docker run` safe too).
python - <<'PY'
import os, time
import psycopg

url = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://pgms:pgms_dev@postgres:5432/pgms",
).replace("+psycopg", "")
for i in range(60):
    try:
        psycopg.connect(url).close()
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit("Database never became ready")
PY

# Bring the schema to the latest revision, then start the API.
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
