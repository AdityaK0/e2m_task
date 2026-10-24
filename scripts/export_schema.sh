#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/db"
OUTPUT_FILE="$OUTPUT_DIR/e2m_insights_schema.sql"

mkdir -p "$OUTPUT_DIR"
TEMP_FILE="$(mktemp "$OUTPUT_DIR/e2m_insights_schema.XXXXXX")"
trap 'rm -f "$TEMP_FILE"' EXIT

docker compose -f "$REPO_ROOT/docker-compose.yml" exec -T postgres \
  pg_dump -U csm -d "e2m-insights" --schema-only --no-owner --no-privileges \
  --exclude-table=public.alembic_version \
  > "$TEMP_FILE"

{
  printf '%s\n' \
    "-- Reference snapshot generated from the migrations on $(date +%F)." \
    "-- Migrations are the source of truth; regenerate with scripts/export_schema.sh." \
    ""
  cat "$TEMP_FILE"
} > "$OUTPUT_FILE"
