# Backoffice: informes y exportaciones
> Última actualización: 2026-11-19

## Qué hace
La pestaña **Informes** del backoffice muestra cómo va el negocio en los últimos 12 meses:
ingresos, usuarios y uso. También deja bajar a CSV las cuentas, los pagos y el registro del
backoffice. Es de solo lectura: nada de acá cambia datos, salvo la fila del registro que deja
cada exportación.

Especificación: `odd/tasks/backoffice-superadmin.md`, S5 a S8.

## Cómo funciona

### Backend
Vive en `backend/apps/backoffice/reports.py` y responde bajo `/api/backoffice/informes/`. Cada
vista hereda de `BackofficeView`, así que exige `is_superuser` (`IsSuperuser`): una cuenta sin
sesión o que no es super admin recibe 403.

Los meses son los últimos 12 meses calendario en hora de Buenos Aires, del más viejo al más
nuevo, con la forma `"2026-11"`. Siempre vienen los 12: un mes sin datos viene con ceros. Los
montos son números JSON, no strings.

#### `GET ingresos/` (S5)
```json
{
  "meses": [
    {
      "mes": "2025-12",
      "cobrado_ars": 0,
      "pagos_aprobados": 0,
      "pagos_rechazados": 0,
      "altas": 0,
      "bajas": 0
    }
  ],
  "mrr_ars": 64800
}
```
- `cobrado_ars`: suma de los pagos aprobados en pesos, por el día en que se pagaron (`paid_at`).
- `pagos_aprobados` y `pagos_rechazados`: cantidad de pagos, por el día en que se registraron
  (`created_at`). Cuentan pagos en cualquier moneda (A).
- `altas`: suscripciones de Mercado Pago creadas ese mes que no quedaron pendientes. Una
  suscripción pendiente nunca se pagó, así que no es un alta.
- `bajas`: suscripciones canceladas o pausadas cuyo `ended_at` cae en ese mes.
- `mrr_ars`: el ingreso mensual recurrente. Suma los montos de las suscripciones autorizadas,
  sin fecha de fin y en pesos. Sale de `payments_summary()`, la misma función del Resumen.

#### `GET usuarios/` (S6)
```json
{
  "meses": [{ "mes": "2025-12", "altas": 0 }],
  "por_plan": [
    {
      "plan": { "code": "productor", "name": "Productor" },
      "founder": 2,
      "trial": 1,
      "active": 1,
      "total": 4
    }
  ],
  "conversion": { "pruebas": 3, "pagaron": 1, "porcentaje": 33.3 },
  "founders": { "usados": 3, "cupo": 100, "libres": 97 }
}
```
- `meses`: altas de cuentas por `date_joined`.
- `por_plan`: cuentas de cada plan, en el orden de los planes, separadas por estado. Usa
  `STATUS_FILTERS`, la misma regla que `plans.membership_status`: un número de founder gana
  sobre un vencimiento.
- `conversion`: `pruebas` son las cuentas que alguna vez tuvieron un `PlanChange` con motivo
  `trial`. `pagaron` son las que después de su primera prueba tuvieron uno con motivo `payment`.
  `porcentaje` va redondeado a un decimal, y es `null` si nadie hizo una prueba.
- `founders`: números entregados por el programa (`next_number - 1`), el cupo y los lugares
  libres (`FounderProgram.remaining`, el mismo dato del Resumen).

#### `GET uso/` (S7)
```json
{
  "meses": [{ "mes": "2025-12", "lotes": 0 }],
  "lotes_total": 47,
  "alertas_activas": 18,
  "usuarios_activos_30_dias": 26
}
```
- `meses`: lotes creados por mes; `lotes_total`: todos los lotes que existen.
- `alertas_activas`: reglas de alerta con `enabled`.
- `usuarios_activos_30_dias`: cuentas con `last_login` en los últimos 30 días.

#### `GET exportar/<cuentas|pagos|registro>.csv` (S8)
Responde `text/csv; charset=utf-8` como adjunto (`Content-Disposition: attachment`). El archivo
empieza con el BOM de UTF-8 y los encabezados están en castellano. Cualquier otro nombre de
archivo responde 404.

| Archivo | Columnas |
|---|---|
| `cuentas.csv` | ID, Nombre, Email, Plan, Estado, Founder n.º, Vence la prueba, Activa, Super admin, Alta, Último ingreso, Lotes |
| `pagos.csv` | ID, Cuenta, Email, Pasarela, ID en la pasarela, Suscripción, Monto, Moneda, Estado, Pagado el, Registrado |
| `registro.csv` | ID, Fecha, Hecho por, Email, Acción, Cuenta, Email de la cuenta, Datos |

- Las fechas van como `2026-11-16 09:00`, en hora de Buenos Aires. Los sí y no van como `sí` y
  `no`. Una celda vacía es un dato que no existe.
- Los pagos y el registro van del más nuevo al más viejo, como en sus pestañas. Las cuentas van
  por fecha de alta, de la más nueva a la más vieja.
- `Datos` del registro es el `payload` de la acción en JSON, con las claves ordenadas.
- Nunca salen el hash de la contraseña, el `payload` de Mercado Pago, el `checkout_url` ni
  ningún token.
- Cada exportación deja una fila `export` en el registro con `{"file": "pagos.csv", "rows": 2}`.
  La fila se guarda después de leer los datos, así que un `registro.csv` no se incluye a sí
  mismo.

### Frontend
- La pestaña está en `frontend/src/pages/backoffice/Informes.tsx`, con sus piezas en
  `pages/backoffice/informes/`.
- El cliente de la API está en `frontend/src/api/backofficeReports.ts` y los estilos en
  `frontend/src/styles/backoffice-informes.css`.
- Cada informe tiene su propia consulta, así que si uno falla los otros se siguen viendo.
- Los meses se muestran en tablas. La primera columna de cada tabla dibuja una barra de CSS bajo
  el mes, a escala del mes más alto. La barra es decorativa (`aria-hidden`), porque el número
  siempre está en su celda.
- Las descargas son links comunes con `download` a las URLs de la API. El navegador manda la
  cookie de sesión en el GET y guarda el archivo.
- Un 403 se trata igual que en las otras pestañas: se vuelve a pedir `me` y la página manda a
  Perfil sin cerrar la sesión.
- El mock (`frontend/src/mocks/backofficeReports.ts`) arma datos de ejemplo por cada base mock.
  Los tests los cambian con `reportsOf(db)`.

## Decisiones y por qué
- **Meses calendario de Buenos Aires.** El negocio y los usuarios están en Argentina, y el
  Resumen ya cuenta "este mes" desde el día 1 en esa hora. Un pago del 31 de octubre a las 23 h
  es de octubre, aunque en UTC ya sea 1 de noviembre. Siempre vienen 12 meses, con ceros, para
  que la tabla no saltee meses y las barras se puedan comparar.
- **El MRR sale de `payments_summary()`.** Así el informe y el Resumen nunca muestran dos cifras
  distintas para el mismo dato.
- **Los montos en pesos, aparte.** Sumar pesos con dólares no da un número que sirva. Los
  conteos de pagos sí incluyen todas las monedas, porque cuentan operaciones, no plata (A).
- **BOM en el CSV.** Excel abre un CSV sin BOM como Windows-1252 y rompe los acentos
  ("Último", "Suscripción"). Con el BOM lo lee como UTF-8. Google Sheets y LibreOffice lo
  ignoran.
- **Protección contra inyección en CSV.** Nombres, emails y notas los escribe cualquiera. Una
  planilla ejecuta como fórmula una celda que empieza con `=`, `+`, `-` o `@`, por ejemplo
  `=HYPERLINK(...)`. Por eso esas celdas llevan un `'` adelante y se leen como texto.
- **Cada exportación queda en el registro.** Un CSV saca de la app los datos personales de
  todas las cuentas. Queda anotado quién lo bajó, qué archivo era y cuántas filas tenía.
- **Sin librerías de gráficos.** Tablas y barras de CSS alcanzan para 12 meses, se leen en un
  teléfono y con lector de pantalla, y no suman una dependencia.

## Cómo modificarlo
- **Una métrica nueva por mes.** Agregá una serie a `month_rows(...)` con `per_month(queryset,
  campo, meses)`; para sumar en vez de contar pasá `total=Sum(...)`. Sumala al tipo en
  `api/backofficeReports.ts` y como columna en la `MonthTable` de `Informes.tsx`.
- **Una columna en un CSV.** Agregala al encabezado y a la fila de su función
  (`account_export`, `payment_export` o `log_export`). Pasá el valor crudo: `cell()` ya formatea
  las fechas y los sí/no y aplica la protección contra fórmulas. Nunca agregues el `payload` de
  un pago, el `checkout_url` ni datos de contraseña.
- **Un archivo nuevo.** Escribí su función, sumala a `EXPORTS` en `reports.py`, agregá el nombre
  a `ExportFile` y a `DOWNLOADS` en el frontend y al mock.
- **Tests.** Están en `backend/tests/test_backoffice_reports.py` y en
  `frontend/src/test/backoffice-informes.test.tsx`.

## Historial
- 2026-11-19: versión inicial. Informes de ingresos, usuarios y uso, y exportación a CSV
  (S5 a S8).
