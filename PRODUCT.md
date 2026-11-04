# Product

## Register

product

## Users

Productores agrícolas argentinos (45–70 años) como usuario primario: consultan desde el celular, en el campo, a pleno sol, con señal irregular y poco tiempo. Poca paciencia con la tecnología; necesitan la respuesta, no el dato crudo. Usuario secundario: técnicos agrónomos jóvenes, cómodos con apps y datos, que analizan reportes e históricos desde escritorio.

El trabajo a resolver: decidir HOY. ¿Hiela esta noche? ¿Puedo pulverizar mañana? ¿Cuándo siembro/cosecho esta semana?

## Product Purpose

"Te decimos qué hacer hoy en tu campo, y te avisamos antes de que sea tarde."

Gaucho Weather responde decisiones agropecuarias por **lote**, es decir, un
campo con ubicación exacta, no por ciudad. Las decisiones son:
- helada a nivel del suelo,
- ventanas de pulverización,
- labores y siembra,
- clima general.

Avisa por push (PWA) y WhatsApp. La zona inicial es el sur de Santa Fe, en la
zona núcleo.

Las probabilidades salen de varios modelos meteorológicos y se validan con
backtesting, y cada regla cita su fuente (ver `Doc/reglas-agronomicas.md`).

El éxito es que el productor abra la app, entienda en menos de 10 segundos qué
hacer en cada lote y confíe en lo que vio, porque la app le explica por qué.

## Brand Personality

Confiable, campechano, directo y con vida. Gaucho Weather representa la
cultura del campo argentino, y el gaucho es su figura central: la app tiene
color y carácter criollo en toda la interfaz, no solo en momentos aislados.

Decisión del usuario (2026-11-03), textual: "perdió toda la esencia del agro
argentino [...] es Gaucho Weather así que tiene que representar eso en una
cultura donde el gaucho es el representante del campo, le falta vida y color".

El tono es cercano y en castellano rioplatense, pero los datos se presentan
con seriedad profesional, porque acá se decide plata. El color y lo criollo
nunca le quitan legibilidad al dato.

## Anti-references

- Dashboard SaaS genérico: tarjetas idénticas en grilla, métricas gigantes con gradientes, glassmorphism decorativo.
- App de clima de consumo (estilo widget de teléfono): linda pero sin respuesta de trabajo; animaciones de nubes que no informan nada.
- Terminología meteorológica sin traducir al impacto agro ("punto de rocío 15.1" en vez de "condiciones para pulverizar: buenas").
- Interfaces de bajo contraste "elegantes": gris claro sobre blanco es ilegible al rayo del sol.

## Design Principles

1. **La decisión primero.** Cada pantalla responde una pregunta de trabajo (¿hiela esta noche?, ¿puedo pulverizar?) antes de mostrar datos crudos. El dato existe para justificar la respuesta.
2. **Legible al rayo del sol.** Contraste AA como piso real (4.5:1 en texto de cuerpo), tipografía generosa, nada de grises lavados. El usuario está afuera, con brillo al máximo.
3. **Un pulgar, guantes puestos.** Targets táctiles de 44px o más, acciones primarias alcanzables con una mano, flujos de un paso. Mobile first sin excusas.
4. **Simple por defecto, profundo a pedido.** La vista inicial le alcanza al productor; el técnico expande capas de detalle cuando las necesita. La densidad es opcional, nunca impuesta.
5. **Criollo y con color, sin perder el dato.** La cultura gaucha da la paleta,
   la tipografía y los motivos de toda la app. El ornamento va en marcos,
   encabezados y momentos clave, nunca encima de un número. Antes este
   principio decía "El gaucho acompaña, no decora"; se reemplazó el 2026-11-03
   por pedido del usuario.
6. **Información para decidir.** El productor ve el pronóstico que necesita
   para trabajar, siempre traducido a su trabajo:
   - lluvia por día en mm y con su probabilidad;
   - lluvia caída en los últimos días;
   - temperatura y viento hora a hora;
   - horarios de salida y puesta del sol;
   - ventanas de trabajo.

## Accessibility & Inclusion

- WCAG 2.2 AA como mínimo; contraste verificado, no estimado.
- Base tipográfica ≥16px en móvil; usuarios mayores como caso central, no borde.
- Targets táctiles ≥44×44px.
- `prefers-reduced-motion` respetado en toda animación.
- La información nunca se comunica solo por color (riesgo de helada también con ícono + texto).
