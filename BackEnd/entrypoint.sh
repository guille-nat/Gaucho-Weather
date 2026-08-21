#!/bin/sh
# Arranque del backend en producción.
#
# Espera a la base, aplica migraciones y junta los estáticos antes de ceder el
# control a gunicorn. `set -e` hace que cualquier fallo aborte el arranque en
# lugar de dejar el contenedor sirviendo con el esquema viejo.
set -e

echo "[entrypoint] Esperando a Postgres en ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
python <<'PY'
import os
import socket
import sys
import time

host = os.getenv("POSTGRES_HOST", "db")
port = int(os.getenv("POSTGRES_PORT", "5432"))
deadline = time.time() + 60

while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=3):
            sys.exit(0)
    except OSError:
        time.sleep(1)

print(f"[entrypoint] Postgres no respondió en {host}:{port} tras 60s", file=sys.stderr)
sys.exit(1)
PY

echo "[entrypoint] Aplicando migraciones..."
python manage.py migrate --noinput

echo "[entrypoint] Recolectando archivos estáticos..."
python manage.py collectstatic --noinput

echo "[entrypoint] Listo. Iniciando: $*"
exec "$@"
