# Despliegue en un VPS

Guía completa para poner Gaucho Weather en producción sobre un servidor propio
con Docker Compose y Nginx.

> **Antes de empezar**, leé [SECURITY.md](SECURITY.md). Hay una acción
> pendiente que depende de vos: rotar la clave privada que estuvo versionada.

---

## Índice

1. [Qué vas a levantar](#1-qué-vas-a-levantar)
2. [Preparar el servidor](#2-preparar-el-servidor)
3. [Configurar el proyecto](#3-configurar-el-proyecto)
4. [Primer arranque sin TLS](#4-primer-arranque-sin-tls)
5. [Emitir el certificado](#5-emitir-el-certificado)
6. [Activar HTTPS](#6-activar-https)
7. [Primer administrador](#7-primer-administrador)
8. [Tareas programadas](#8-tareas-programadas)
9. [Backups](#9-backups)
10. [Deploy de una versión nueva](#10-deploy-de-una-versión-nueva)
11. [Rollback](#11-rollback)
12. [Diagnóstico](#12-diagnóstico)

---

## 1. Qué vas a levantar

```
Internet ──▶ :80/:443  ┌─────────────┐
                       │    proxy    │  Nginx: TLS, ruteo, rate limit
                       └──┬───────┬──┘
                          │       │
              /api/*      │       │   resto
                          ▼       ▼
                   ┌──────────┐ ┌──────────┐
                   │ backend  │ │ frontend │
                   │ gunicorn │ │  Nginx   │
                   └────┬─────┘ └──────────┘
                        │
                 ┌──────┴──────┐
                 ▼             ▼
            ┌────────┐    ┌────────┐
            │   db   │    │ redis  │
            └────────┘    └────────┘
```

**Solo el proxy expone puertos al exterior.** Postgres y Redis viven en la red
interna de Docker y no son alcanzables desde afuera.

### Requisitos

- VPS con Ubuntu 22.04 o similar — 2 GB de RAM alcanzan para empezar
- Un dominio apuntando por A/AAAA a la IP del servidor
- Docker Engine y el plugin Compose

---

## 2. Preparar el servidor

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker

# Firewall: solo SSH y web
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Verificá que el DNS ya resuelva antes de seguir — certbot lo va a necesitar:

```bash
dig +short gauchoweather.com
```

---

## 3. Configurar el proyecto

```bash
sudo mkdir -p /opt/gaucho-weather && sudo chown "$USER" /opt/gaucho-weather
git clone <repo> /opt/gaucho-weather
cd /opt/gaucho-weather

cp .env.example .env
chmod 600 .env    # que solo lo lea tu usuario
```

Generá los secretos, **uno distinto para cada variable**:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # SECRET_KEY_JWT
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # POSTGRES_PASSWORD
```

Editá `.env` con tu dominio real:

```ini
DJANGO_ENV=production
ALLOWED_HOSTS=gauchoweather.com,www.gauchoweather.com
CORS_ALLOWED_ORIGINS=https://gauchoweather.com
CSRF_TRUSTED_ORIGINS=https://gauchoweather.com
FRONTEND_URL=https://gauchoweather.com
VITE_API_BASE_URL=https://gauchoweather.com/api
```

Y reemplazá el dominio en la configuración del proxy:

```bash
sed -i 's/gauchoweather\.com/TU-DOMINIO.com/g' nginx/proxy.conf
```

### Claves de Google

Usá **dos claves distintas**:

| Clave | Restricción | Para qué |
|-------|-------------|----------|
| `GOOGLE_MAPS_API_KEY` | Por IP del servidor + Geocoding API | Backend |
| `VITE_GOOGLE_MAPS_API_KEY` | Por referrer HTTP + Places API | Frontend |

La del frontend queda dentro del bundle y es legible por cualquiera. La
restricción por referrer es lo único que impide que la usen desde otro sitio.

---

## 4. Primer arranque sin TLS

El bloque HTTPS de `nginx/proxy.conf` viene comentado a propósito: Nginx no
arranca si le apuntás a un certificado que todavía no existe.

```bash
mkdir -p nginx/certbot/conf nginx/certbot/www

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

El `entrypoint.sh` del backend espera a Postgres, aplica migraciones y junta los
estáticos antes de ceder el control a gunicorn. Si algo de eso falla, el
contenedor no arranca — es intencional.

Comprobá:

```bash
curl http://TU-DOMINIO.com/healthz    # {"status":"ok"}
curl http://TU-DOMINIO.com/readyz     # database y cache en "ok"
```

---

## 5. Emitir el certificado

```bash
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d TU-DOMINIO.com -d www.TU-DOMINIO.com \
  --email tu@correo.com --agree-tos --no-eff-email
```

> Si algo falla, agregá `--dry-run` y repetí. Let's Encrypt limita a 5 intentos
> fallidos por hora y por dominio.

---

## 6. Activar HTTPS

En `nginx/proxy.conf`:

1. Descomentá todo el bloque `server { listen 443 ssl; ... }`
2. Descomentá el `return 301 https://$host$request_uri;` del bloque `:80`

```bash
docker compose -f docker-compose.prod.yml restart proxy
curl -I https://TU-DOMINIO.com    # HTTP/2 200
```

El servicio `certbot` reintenta la renovación cada 12 horas. Let's Encrypt
renueva recién dentro de los 30 días previos al vencimiento; el resto de las
veces el comando no hace nada.

### Endurecer HSTS

Con el certificado renovando solo, subí en `.env`:

```ini
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=true
```

**Hacelo en ese orden y no antes.** Los navegadores recuerdan la política: si
la activás con un año y después perdés el certificado, tu sitio queda
inaccesible hasta arreglarlo. `SECURE_HSTS_PRELOAD` solo si estás seguro de que
todos los subdominios van por HTTPS para siempre.

---

## 7. Primer administrador

```bash
docker compose -f docker-compose.prod.yml exec backend \
  python manage.py createsuperuser
```

El admin queda en `https://TU-DOMINIO.com/api/admin/`.

---

## 8. Tareas programadas

Las alertas de helada no se disparan solas: necesitan un cron.

```bash
crontab -e
```

```cron
# Alertas de helada, 18:00 y 04:00
0 18,4 * * * cd /opt/gaucho-weather && docker compose -f docker-compose.prod.yml exec -T backend python manage.py send_frost_alerts >> /var/log/gaucho-frost.log 2>&1

# Backup diario, 03:00
0 3 * * * /opt/gaucho-weather/scripts/backup.sh >> /var/log/gaucho-backup.log 2>&1
```

Probá primero sin enviar nada:

```bash
docker compose -f docker-compose.prod.yml exec backend \
  python manage.py send_frost_alerts --dry-run
```

---

## 9. Backups

El script está en `scripts/backup.sh`. Guarda un dump comprimido y conserva
14 días.

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

**Un backup que nunca restauraste no es un backup.** Probá la restauración al
menos una vez:

```bash
gunzip -c /opt/gaucho-weather/backups/gaucho-YYYY-MM-DD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Copiá los backups fuera del servidor. Un disco que falla se lleva la base y el
backup juntos.

---

## 10. Deploy de una versión nueva

```bash
cd /opt/gaucho-weather

./scripts/backup.sh                       # 1. respaldo antes de tocar nada
git pull origin main                      # 2. traer los cambios
docker compose -f docker-compose.prod.yml build    # 3. construir
docker compose -f docker-compose.prod.yml up -d    # 4. reemplazar

curl -fsS https://TU-DOMINIO.com/readyz   # 5. verificar
```

Las migraciones las aplica el `entrypoint.sh` en el arranque.

### Migraciones que pueden fallar

`users.0002` agrega **unicidad al email**. Si en la base hay cuentas con el
mismo correo, la migración aborta. Revisalo antes:

```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT lower(email), count(*) FROM users_customuser
   GROUP BY lower(email) HAVING count(*) > 1;"
```

Si aparecen duplicados hay que resolverlos a mano antes de migrar. Es una
decisión de negocio: qué cuenta se queda con el correo.

---

## 11. Rollback

```bash
git log --oneline -5
git checkout <commit-anterior>
docker compose -f docker-compose.prod.yml up -d --build
```

Si la versión nueva aplicó migraciones, volver el código **no** vuelve el
esquema. Para eso está el backup:

```bash
docker compose -f docker-compose.prod.yml stop backend
gunzip -c backups/gaucho-<fecha>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose -f docker-compose.prod.yml start backend
```

---

## 12. Diagnóstico

```bash
# Estado y salud de cada contenedor
docker compose -f docker-compose.prod.yml ps

# Logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs --tail=100 proxy

# Uso de recursos
docker stats --no-stream
```

| Síntoma | Causa probable | Qué mirar |
|---------|----------------|-----------|
| El backend reinicia en bucle | Falta una variable obligatoria | `logs backend` — el error dice cuál |
| `readyz` devuelve 503 | Postgres o Redis caídos | El campo `checks` de la respuesta |
| Redirección infinita | Falta `X-Forwarded-Proto` | Que `proxy_params_gaucho` esté montado |
| CSS del admin sin estilos | `collectstatic` no corrió | `logs backend` en el arranque |
| CORS bloqueado en el navegador | Origen no declarado | `CORS_ALLOWED_ORIGINS` en `.env` |
| 429 en la API | Rate limit alcanzado | `THROTTLE_ANON` / `THROTTLE_USER` |
| El pronóstico no carga | Clave de Tomorrow.io vencida o sin cuota | `logs backend`, buscar "Error fetching" |

### Chequeo de configuración

```bash
docker compose -f docker-compose.prod.yml exec backend \
  python manage.py check --deploy
```

Debería reportar solo `security.W005` y `security.W021` (las de HSTS) mientras
no las hayas endurecido. Cualquier otra cosa merece atención.
