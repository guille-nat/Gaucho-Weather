# Arquitectura
> Última actualización: 2026-11-03

## Qué hace
Describe los componentes de la v2 y cómo fluyen los datos. El plan completo está
en `plan-reescritura.md` (Arquitectura propuesta).

## Cómo funciona
```
navegador (PWA) ──/api──▶ Vite (dev) | nginx (prod) ──▶ Django + DRF ──▶ Postgres
beat ──▶ Redis ──▶ Celery worker ──▶ Open-Meteo, SMN
                         └──────────────────────────────────────▶ Postgres (archivo)
```
- **Backend** (`backend/`), con Django + DRF. Apps en `backend/apps/`:
  - `accounts`: usuario con email y sesión con CSRF. Ver `funcionalidades/auth.md`.
  - `lotes`: lotes del usuario y su `summary`. Ver `funcionalidades/lotes.md`.
  - `archiver`: pronósticos y observaciones crudos. Ver `funcionalidades/archivador.md`.
    También arma el pronóstico del lote desde el archivo (`forecast.py`). Ver
    `funcionalidades/pronostico.md`.
- **Motor de decisiones** (`backend/engine/`): paquete Python puro, sin Django.
  Recibe series horarias normalizadas y devuelve veredictos con su motivo.
  Ver `funcionalidades/motor-decisiones.md`.
- **Contrato de la API:** JSON bajo `/api/`, en el mismo origen que el frontend.
  Los errores son `{"detail": "..."}` o errores por campo `{"campo": ["..."]}`,
  en español. `GET /api/health/` responde `{"status": "ok"}`.
- **Tareas:** Celery con Redis como broker y beat para la agenda. Las tareas
  son idempotentes y toleran fallas de red.
- **Lectura:** la API nunca llama a proveedores externos al responder. Lee lo
  que el archivador ya guardó, así responde rápido y hace menos llamadas.

## Decisiones y por qué
- **Decisión:** el archivador guarda la respuesta cruda de cada proveedor.
  **Por qué:** el formato normalizado del motor (Fase 2) todavía no existe, y la
  respuesta cruda permite rehacerlo después sin perder datos.
- **Decisión:** el motor de decisiones será un paquete Python puro, fuera de Django.
  **Por qué:** se testea solo y se reusa en el backtesting (ver el plan).
  Desde el 2026-11-03 existe como `backend/engine/` (v0, sin validar): el lado
  Django normaliza el JSON crudo y el motor no conoce a Open-Meteo.

## Historial
- 2026-11-03: versión inicial (Fase 1).
- 2026-11-03: motor de decisiones v0 y endpoint de pronóstico del lote.
