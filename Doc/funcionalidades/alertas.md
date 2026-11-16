# Alertas personalizadas
> Última actualización: 2026-11-16

## Qué hace
El usuario escribe sus propias reglas por lote, por ejemplo "avisame si la
mínima baja de 2 °C en el lote Norte". Después de cada descarga de pronósticos
se evalúan, y cada regla que se cumple genera un aviso en la bandeja `/alertas`,
por push (Web Push) y por email.

## Cómo funciona

### Reglas
App `backend/apps/alerts/`. Una `AlertRule` es usuario + lote + variable +
comparación + valor, con `enabled`. Validación y redacción en `rules.py`
(`SPECS`, `validation_errors` y `describe`).

| Variable | Comparaciones | Rango | Cómo se lee |
|---|---|---|---|
| `frost` (helada en el suelo) | `lt`, `lte` | −15 a 10 °C | "Helada en el suelo por debajo de 2 °C en Norte" |
| `temp_min` | `lt`, `lte`, `gt`, `gte` | −30 a 50 °C | "Mínima menor a 2 °C en Norte" |
| `temp_max` | `lt`, `lte`, `gt`, `gte` | −30 a 50 °C | "Máxima mayor a 35 °C en Norte" |
| `rain` (lluvia del día) | `gt`, `gte` | 0 a 500 mm | "Lluvia mayor a 20 mm en el día en Norte" |
| `wind` | `gt`, `gte` | 0 a 200 km/h | "Viento mayor a 30 km/h en Norte" |
| `spray_window` | sin comparación ni valor | — | "Ventana para pulverizar en Norte" |

- API: `/api/alertas/reglas/` (GET, POST, PATCH, DELETE), solo del dueño; la de
  otro usuario es 404.
- Superar el límite del plan responde 402 (ver [planes.md](planes.md)). Las
  reglas que exceden el límite después de bajar de plan devuelven
  `paused_by_plan` y no se evalúan.
- Borrar un lote borra sus reglas. Los avisos ya creados quedan, sin lote.

### Evaluación
- La tarea `archiver.fetch_forecasts` encola `alerts.evaluate_rules` al
  terminar (`.delay()`). Si el broker está caído lo registra y sigue; la
  próxima corrida lo vuelve a encolar.
- `run_evaluation` (`tasks.py`) toma las reglas activas que cubre el plan, las
  agrupa por celda de 0,1° y lee el pronóstico de consenso del archivo
  (`forecasts()`). Si el pronóstico de la celda tiene más de
  `ALERTS_MAX_FORECAST_AGE_HOURS` (12 h), no evalúa esa celda.
- `evaluate.py` es puro (no toca la base). La ventana es el resto de hoy (horas
  posteriores a ahora) más todo mañana, en hora argentina:

  | Variable | Qué mira |
  |---|---|
  | `temp_min`, `temp_max`, `wind` | el extremo del día entre las horas que faltan; el viento suma la ráfaga máxima al texto |
  | `rain` | hoy: suma de las horas que faltan; mañana: el total diario del pronóstico (la mediana entre modelos) |
  | `frost` | `decisions.frost_tonight.ground_estimate_c`; el aviso se fecha al inicio de la noche |
  | `spray_window` | `decisions.spray_today.best_window`, solo hoy |

- Deduplicación: un `AlertEvent` por `(rule, target_date)`
  (`UniqueConstraint`), creado con `get_or_create`. Volver a evaluar no crea ni
  envía nada nuevo.
- A mano, sin broker: `docker compose exec backend python manage.py evaluate_alerts`.

### Envío
`alerts.deliver_event` (`delivery.py`) se encola al confirmar la transacción,
solo para avisos nuevos. Cada canal tiene su estado:

```
pending ──claim──> sending ──> sent | skipped | failed
                      └──falla transitoria──> pending (attempts + 1, se reintenta)
```

- Solo el worker cuyo UPDATE pasó el canal de `pending` a `sending` lo envía,
  así un aviso nunca sale dos veces por el mismo canal.
- **Push** (pywebpush 2.5.0, claves VAPID, TTL 12 h): se saltea (`skipped`) si
  el plan no tiene push, si el usuario lo apagó o si faltan las claves VAPID.
  Se envía a todas las suscripciones del usuario.

  | Respuesta del servicio push | Qué pasa |
  |---|---|
  | 404, 410 | la suscripción ya no existe: se borra |
  | sin status, 400, 413 | suscripción rota: se borra y no provoca un reintento |
  | 401, 403 | rechazó nuestras claves VAPID: error en el log, `failed`, sin borrar ni reintentar |
  | otro error o falla de red | transitoria: se reintenta |

- **Email:** `send_mail` con el texto y un enlace a `/alertas`; se saltea si el
  usuario apagó los emails.
- **Reintentos:** 3, a los 1, 4 y 16 minutos. Después del último, el canal queda
  `failed`.

### Bandeja y suscripciones (bajo `/api/alertas/`)

| Método y ruta | Qué hace |
|---|---|
| `GET eventos/` | últimos 100 avisos y `unread_count` |
| `POST eventos/leer/` | marca leídos los `ids` dados, o todos si no se mandan |
| `GET push/clave/` | clave pública VAPID; 503 si no está configurada |
| `POST push/` | suscribe este navegador (upsert por endpoint, solo `https://`); 402 en Básico |
| `DELETE push/` | desuscribe ese endpoint |

### Frontend
- `/alertas` (`Alertas.tsx`): Avisos (tocar marca leído, y "marcar todo"), Tus
  reglas (activar, borrar con confirmación, "Pausada por tu plan", uso), Nueva
  regla (vista previa en vivo; 402 con Ver planes) y Notificaciones en este
  teléfono.
- Push en el teléfono (`lib/push.ts`): el permiso se pide solo al tocar el
  botón. En iPhone solo funciona con la app instalada en la pantalla de inicio,
  y la pantalla lo explica. En Básico no se ofrece.
- El service worker (`src/sw.ts`) muestra la notificación y, al tocarla, abre
  solo URLs del mismo origen (si no, `/alertas`). Ver
  [frontend-pwa.md](frontend-pwa.md).
- Salir borra primero la suscripción push de este teléfono
  (`forgetPushBeforeLogout`), con 3 s como máximo y sin bloquear el logout si
  falla.

## Decisiones y por qué
- **Decisión:** reglas propias por lote, no alertas fijas.
  **Por qué:** pedido del usuario ("alertas personalizadas") y decisión del plan
  aprobado ("Reglas propias por lote").
- **Decisión:** canales push + bandeja y email; WhatsApp fuera de alcance.
  **Por qué:** decisión del plan aprobado ("opcion 1 y 2").
- **Decisión:** primero se guarda el aviso, después se envía.
  **Por qué:** el aviso es la fila de la bandeja, y la restricción única evita
  duplicados si la evaluación corre dos veces.
- **Decisión:** el aviso de helada se fecha al inicio de la noche.
  **Por qué:** una corrida a la tarde y otra de madrugada describen la misma
  noche y deben dar un solo aviso.
- **Decisión:** no se evalúan pronósticos de más de 12 h.
  **Por qué:** con datos viejos es mejor no avisar que avisar mal.
- **Decisión:** un canal que quedó en `sending` por una caída del worker no se
  recupera.
  **Por qué:** perder un aviso es mejor que mandarlo dos veces. Aceptado y
  documentado.
- **Decisión:** 401/403 del servicio push no borra la suscripción.
  **Por qué:** es un problema de nuestras claves, no del navegador.
- **Decisión:** la suscripción se identifica por endpoint y pasa al usuario que
  está conectado.
  **Por qué:** un teléfono compartido debe recibir los avisos de quien usa la
  app ahora (por diseño).

## Cómo modificarlo
- **Claves VAPID:** generar un par una sola vez con
  `npx web-push generate-vapid-keys` y cargarlo en `VAPID_PUBLIC_KEY` y
  `VAPID_PRIVATE_KEY` (la privada es secreta). Un par nuevo invalida todas las
  suscripciones. `VAPID_SUBJECT` es el contacto (`mailto:` o `https:`). Sin
  claves no hay push, pero la bandeja y el email funcionan.
- **Nueva variable:** sumarla en `AlertRule.Variable` (migración), en `SPECS` y
  `describe` de `rules.py`, en `evaluate.py`, y en la copia del frontend
  (`frontend/src/api/alerts.ts`), que debe seguir a `rules.py`.
- En desarrollo hacen falta el worker y beat (`docker compose up -d worker
  beat`), y reconstruir la imagen del backend para tener pywebpush.
- Tests: `backend/tests/test_alert_rules.py`, `test_alert_evaluate.py`,
  `test_alert_task.py`, `test_alert_delivery.py` y `test_alert_inbox.py`. El
  service worker no tiene test automático (se probó a mano por CDP).

### Pendientes
- Un canal en `sending` después de una caída del worker queda así para siempre.
- Si la cookie venció o la cuenta se borró, el navegador sigue suscripto hasta
  que otra cuenta lo suscriba.
- Los textos de las reglas del frontend son una copia de `rules.py`.

## Historial
- 2026-11-16: versión inicial (feature `cuenta-planes-alertas`, T6 a T10).
