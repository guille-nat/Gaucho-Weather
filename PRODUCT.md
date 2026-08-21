# Product

## Register

product

## Users

Productores agrícolas argentinos (45–70 años) como usuario primario: consultan desde el celular, en el campo, a pleno sol, con señal irregular y poco tiempo. Poca paciencia con la tecnología; necesitan la respuesta, no el dato crudo. Usuario secundario: técnicos agrónomos jóvenes, cómodos con apps y datos, que analizan reportes e históricos desde escritorio.

El trabajo a resolver: decidir HOY. ¿Hiela esta noche? ¿Puedo pulverizar mañana? ¿Cuándo siembro/cosecho esta semana?

## Product Purpose

Gaucho Weather entrega clima hiperlocal orientado a decisiones agropecuarias: condiciones actuales, pronóstico a 6 días, riesgo de helada con alertas por correo, históricos y reportes. Éxito = el productor abre la app, entiende en menos de 10 segundos qué hacer, y confía en lo que vio.

## Brand Personality

Confiable, campechano, directo. El gaucho de la marca es identidad con carácter: acompaña en momentos clave (bienvenida, estados vacíos, alertas), no decora cada esquina. Tono cercano y en castellano rioplatense, pero los datos se presentan con seriedad profesional: acá se decide plata.

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
5. **El gaucho acompaña, no decora.** La identidad aparece con intención en momentos clave; el resto de la interfaz es sobria y deja hablar a los datos.

## Accessibility & Inclusion

- WCAG 2.2 AA como mínimo; contraste verificado, no estimado.
- Base tipográfica ≥16px en móvil; usuarios mayores como caso central, no borde.
- Targets táctiles ≥44×44px.
- `prefers-reduced-motion` respetado en toda animación.
- La información nunca se comunica solo por color (riesgo de helada también con ícono + texto).
