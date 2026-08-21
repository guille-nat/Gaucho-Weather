# Contribuir

## Antes de escribir código

Leé el [README](README.md) y entendé por qué el clima **no** se persiste en la
base y por qué el cacheo es explícito por vista. Son dos decisiones que se ven
raras si no conocés el motivo, y ambas están explicadas ahí.

---

## Entorno

```bash
cp .env.example .env      # completá los secretos
docker compose up --build
```

---

## Antes de abrir un PR

```bash
# Backend
docker compose exec backend env DJANGO_ENV=testing python manage.py test
docker compose exec backend python manage.py makemigrations --check --dry-run

# Frontend
cd FrontEnd && npm run lint && npm run build
```

CI corre lo mismo, más la construcción de las imágenes de producción.

---

## Convenciones

### Commits

Conventional commits, en español o inglés pero **consistente dentro del PR**:

```
feat(weather): expone la probabilidad de helada por día
fix(users): hashea la contraseña en el PATCH de perfil
docs(deploy): agrega el procedimiento de rollback
```

### Idioma

- **Comentarios y docstrings del backend:** español, como el resto del proyecto.
- **Identificadores:** inglés (`calculate_frost_probability`, no `calcular_...`).
- **Textos de interfaz:** español rioplatense, sin voseo forzado.
- **Mensajes de error de la API:** español, y siempre con la salida — decir qué
  pasó *y* cómo resolverlo.

### CSS

Hay un sistema de tokens en `src/styles/index.css`, en tres capas: primitivos →
semánticos → alias heredados.

**Nunca escribas un color literal en el CSS de un componente.** Si te falta un
token, agregalo a la capa semántica. Un `#1976d2` suelto es un color que mañana
nadie puede cambiar de un solo lugar.

```css
/* mal */
.card { color: #1976d2; border: 1px solid #e2e8f0; }

/* bien */
.card { color: var(--brand); border: 1px solid var(--line-default); }
```

Los alias heredados (`--primary-color`, `--card-color`, …) existen solo para que
el CSS viejo siga funcionando. En código nuevo usá los semánticos.

### Riesgo de helada

`calculate_frost_probability` es el corazón del producto. Si tocás sus pesos:

1. Justificá el cambio con datos, no con intuición.
2. Actualizá `weather/tests/test_utils.py`.
3. Acordate de que un falso negativo le cuesta una cosecha a alguien.

---

## Reglas que no se negocian

**No agregues `UpdateCacheMiddleware` ni `FetchFromCacheMiddleware`.** Cachean
por URL y la API autentica por header, así que servirían la respuesta de un
usuario a otro. Hay un test que falla si vuelven; no lo silencies, entendé por
qué está. Ver [SECURITY.md](SECURITY.md).

**No pongas secretos en el código ni en el repo.** Van en `.env`, documentados
en `.env.example`. CI falla si aparece un `.key`, `.pem` o `.env` versionado.

**No uses `CORS_ALLOW_ALL_ORIGINS` en producción.** Junto con
`CORS_ALLOW_CREDENTIALS` permite que cualquier sitio haga pedidos autenticados
en nombre del usuario.

**Si tocás un modelo, generá la migración.** CI corta con
`makemigrations --check`.

---

## Tests

Los tests de regresión llevan en su docstring **qué bug documentan**. Si
agregás uno, seguí esa costumbre: dentro de seis meses nadie se acuerda por qué
existe una aserción rara, y sin el contexto alguien la borra.

```python
class ResponseCacheIsolationTests(TestCase):
    """
    El bug: config/base.py cargaba UpdateCacheMiddleware...
    """
```
