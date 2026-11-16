# Marca: el gaucho

## Qué es
El logo es un gaucho tradicional de frente, delante del sol pampeano:
chambergo de ala ancha, melena, barba, bigote, poncho con una guarda y un
pañuelo celeste al cuello. La cara no se dibuja: la definen el sombrero, la
barba y el poncho sobre el sol dorado.

- Componente: `frontend/src/components/BrandMark.tsx`.
- Colores fijos: oro pampa `#f2b705`, tinta `#1d1600`, celeste `#8fd0ff`.
- Por debajo de 24 px se ocultan los ojos y las guardas doradas, para que la
  silueta siga limpia en la barra y en el favicon.
- Íconos: `frontend/public/favicon.svg` (versión simple, sin fondo) y los PNG
  de la PWA sobre el azul del cielo (`#1d68c4`). El maskable deja el disco
  dentro de la zona segura.

## Animación
El único gesto de la marca es el saludo: el gaucho levanta el chambergo.

- En la pantalla de carga (`Splash`) saluda en bucle mientras carga.
- En el ingreso y el registro (`AuthLayout`) saluda una sola vez al entrar.
- En la barra de navegación queda quieto.
- Con `prefers-reduced-motion` no se anima.
- Tokens: `--dur-salute` (1100 ms) y `--ease-salute`.

## Por qué
- Decisión del usuario (2026-11-04): "el logo debe ser un gaucho tradicional".
  Reemplaza al sol sobre el horizonte, y al rombo rosa del mundo catastro en el
  favicon.
- El gaucho es la figura central de la marca (ver `PRODUCT.md`); el sol dorado
  conserva el acento de "Cielo vivo".
- El celeste del pañuelo es el único color nuevo: remite al cielo y a
  Argentina sin agregar ornamento.
