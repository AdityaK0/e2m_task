#!/usr/bin/env bash
set -euo pipefail

echo "Waiting for PostgreSQL..."
python - <<'PY'
import time
import sys
from sqlalchemy import create_engine, text
from app.config import settings

for attempt in range(1, 31):
    try:
        engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("PostgreSQL is reachable")
        break
    except Exception as exc:
        print(f"Database not ready ({attempt}/30): {type(exc).__name__}", flush=True)
        time.sleep(2)
else:
    print("Database did not become ready in time", file=sys.stderr)
    sys.exit(1)
PY

echo "Applying database migrations..."
alembic upgrade head

echo "Starting API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WEB_CONCURRENCY:-2}"
