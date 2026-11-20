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
- [funcionalidades/planes.md](funcionalidades/planes.md): los tres planes,
  los 100 founders, la prueba de Productor y el límite 402.
- [funcionalidades/cuenta.md](funcionalidades/cuenta.md): editar datos y
  preferencias, cambiar y recuperar la contraseña, y borrar la cuenta.
- [funcionalidades/alertas.md](funcionalidades/alertas.md): reglas de alerta
  por lote, su evaluación y el envío por push, email y bandeja.
- [funcionalidades/historico.md](funcionalidades/historico.md): histórico de
  clima y viento por lote, guardado en una tabla propia.
- [funcionalidades/lotes.md](funcionalidades/lotes.md): API de lotes, sus
  cultivos (varios por lote), cómo se validan y el resumen de la mínima de la
  noche.
- [funcionalidades/archivador.md](funcionalidades/archivador.md): cómo se
  archivan los pronósticos y las observaciones del SMN para el backtesting.
- [funcionalidades/frontend-pwa.md](funcionalidades/frontend-pwa.md): la PWA
  mobile first, el funcionamiento sin conexión y la limpieza de datos al salir.
- [funcionalidades/motor-decisiones.md](funcionalidades/motor-decisiones.md):
  motor de decisiones v0 (helada, pulverización y labores), sus reglas y
  supuestos. Todavía no está validado con backtesting.
- [funcionalidades/pronostico.md](funcionalidades/pronostico.md): pronóstico
  por lote y pronóstico público de cualquier punto de Argentina, con lluvia,
  probabilidades, hora a hora y sol, y la descarga a demanda.
- [funcionalidades/lugares.md](funcionalidades/lugares.md): búsqueda de
  lugares y ubicación inversa con Georef AR, sus términos y la caché.
- [funcionalidades/backoffice.md](funcionalidades/backoffice.md): backoffice para
  super admins (resumen, cuentas con su ficha y cambios a mano, pedidos de plan, pagos,
  precios y registro de acciones), su API y la pantalla `/backoffice`.
- [funcionalidades/backoffice-informes.md](funcionalidades/backoffice-informes.md):
  informes del backoffice (ingresos, usuarios y uso por mes) y exportación a CSV.
- [funcionalidades/pagos.md](funcionalidades/pagos.md): suscripciones mensuales en
  pesos con Mercado Pago, el webhook, la baja y cómo probarlo en el sandbox.
