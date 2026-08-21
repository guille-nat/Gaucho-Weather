#!/usr/bin/env bash
# Backup de la base de Gaucho Weather.
#
#   ./scripts/backup.sh
#
# Guarda un dump comprimido en backups/ y conserva los últimos 14 días.
# Pensado para correr por cron; ver DEPLOYMENT.md.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$PROJECT_DIR"

if [ ! -f .env ]; then
    echo "ERROR: no existe .env en $PROJECT_DIR" >&2
    exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${POSTGRES_USER:?falta POSTGRES_USER en .env}"
: "${POSTGRES_DB:?falta POSTGRES_DB en .env}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
TARGET="$BACKUP_DIR/gaucho-$STAMP.sql.gz"

echo "[backup] Volcando $POSTGRES_DB..."

# Se escribe primero a un temporal: si pg_dump falla a mitad, no queda un
# archivo truncado con nombre de backup válido.
TMP="$TARGET.partial"
if docker compose -f "$COMPOSE_FILE" exec -T db \
        pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$TMP"; then
    mv "$TMP" "$TARGET"
else
    rm -f "$TMP"
    echo "[backup] ERROR: pg_dump falló" >&2
    exit 1
fi

SIZE="$(du -h "$TARGET" | cut -f1)"
echo "[backup] Listo: $TARGET ($SIZE)"

echo "[backup] Borrando backups de más de $RETENTION_DAYS días..."
find "$BACKUP_DIR" -name 'gaucho-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete

echo "[backup] Backups presentes: $(find "$BACKUP_DIR" -name 'gaucho-*.sql.gz' | wc -l)"
echo "[backup] Recordá copiarlos fuera del servidor."
