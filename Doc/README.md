# Documentación

- [plan-reescritura.md](plan-reescritura.md): plan para rehacer Gaucho Weather
  desde cero, con el diagnóstico de la versión actual, las decisiones tomadas,
  las fases y la arquitectura propuesta.
- [reglas-agronomicas.md](reglas-agronomicas.md): reglas y umbrales del motor
  de decisiones (helada, pulverización, labores, siembra y cosecha), con su
  fuente, las fuentes de datos y cómo se mide la precisión.
- [arquitectura.md](arquitectura.md): componentes, flujo de datos e
  integraciones externas (Open-Meteo, SMN).
- [entorno.md](entorno.md): Docker Compose, puertos y variables de entorno
  (solo los nombres).
- [funcionalidades/auth.md](funcionalidades/auth.md): login con cookie de
  sesión, CSRF y límite de intentos.
- [funcionalidades/lotes.md](funcionalidades/lotes.md): API de lotes, cómo se
  validan y el resumen de la mínima de la noche.
- [funcionalidades/archivador.md](funcionalidades/archivador.md): cómo se
  archivan los pronósticos y las observaciones del SMN para el backtesting.
- [funcionalidades/frontend-pwa.md](funcionalidades/frontend-pwa.md): la PWA
  mobile first, el funcionamiento sin conexión y la limpieza de datos al salir.
