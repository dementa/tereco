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

# Every numbered file, in order. Globbed rather than listed so a new one is
# never left out by accident — that would generate types for a schema nobody
# has. `patch-*.sql` files are deliberately excluded: they are already folded
# into the numbered files and re-applying them here would be a no-op at best.
for path in "$SCHEMA_DIR"/[0-9][0-9]-*.sql; do
  f="$(basename "$path")"
  echo "Applying $f..."
  docker cp "$path" "$CONTAINER:/tmp/$f"
  docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q -f "/tmp/$f"
done

echo "Generating $OUT..."
npx --yes supabase gen types typescript \
  --db-url "postgresql://postgres:postgres@127.0.0.1:$PORT/postgres" \
  --schema public > "$OUT"

echo "Done. Now run: npx tsc --noEmit"
