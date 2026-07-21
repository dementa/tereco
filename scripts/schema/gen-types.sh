#!/usr/bin/env bash
#
# Regenerates lib/database.types.ts from the schema files in this directory.
#
# Run this after ANY change to 01-core.sql / 02-audit.sql. The Supabase JS
# client is untyped without it, which means queries against columns that no
# longer exist typecheck clean and fail only at runtime — that is exactly how
# the whole admin surface silently rotted against the rebuilt schema.
#
# Generates from a throwaway Postgres rather than the live project, so it needs
# no credentials and always reflects what is in git.
#
# Usage: ./scripts/schema/gen-types.sh
set -euo pipefail

CONTAINER=tereco-typegen
PORT=55433
SCHEMA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCHEMA_DIR/../.." && pwd)"
OUT="$REPO_ROOT/lib/database.types.ts"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "Starting throwaway Postgres..."
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" postgres:16 >/dev/null

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

for f in 00-local-stubs.sql 01-core.sql 02-audit.sql 03-collection.sql 04-notifications.sql; do
  [ -f "$SCHEMA_DIR/$f" ] || continue
  echo "Applying $f..."
  docker cp "$SCHEMA_DIR/$f" "$CONTAINER:/tmp/$f"
  docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q -f "/tmp/$f"
done

echo "Generating $OUT..."
npx --yes supabase gen types typescript \
  --db-url "postgresql://postgres:postgres@127.0.0.1:$PORT/postgres" \
  --schema public > "$OUT"

echo "Done. Now run: npx tsc --noEmit"
