# Hueco

[![CI](https://github.com/RaulNuGo06/hueco/actions/workflows/ci.yml/badge.svg)](https://github.com/RaulNuGo06/hueco/actions/workflows/ci.yml)

Reservas de citas para negocios locales: peluquerías, barberías, fisios, talleres. Cada negocio tiene un enlace donde el cliente elige servicio, día y hora desde el móvil, sin crear cuenta. El dueño ve la agenda del día en un panel.

> **Estado:** primera versión. Funcionan la reserva del cliente, el enlace para consultar o cancelar la cita y la agenda del panel. Los servicios, el equipo y los horarios se configuran por ahora desde la API ([hoja de ruta](#hoja-de-ruta)).

<p align="center">
  <img src="docs/capturas/reserva.jpg" width="250" alt="Reserva en el móvil: días de la semana, horas libres y la franja sin huecos de mediodía">
  &nbsp;
  <img src="docs/capturas/cita.jpg" width="250" alt="La cita reservada: hora grande, fecha, servicio y quién atiende">
</p>
<p align="center">
  <img src="docs/capturas/agenda.jpg" width="760" alt="Agenda del día en el panel, con una columna por profesional">
</p>

## Qué hace

### Para el cliente (`/r/{negocio}`)

- Elige el servicio, el profesional (o "quien esté libre"), el día y la hora.
- Las horas salen del horario de cada profesional, con **jornada partida**: la pantalla enseña el hueco de mediodía en vez de esconderlo.
- Reserva con nombre y teléfono, sin cuenta, y recibe un enlace privado (`/cita/{código}`) para consultar o **cancelar** su cita.
- Si otra persona se lleva el hueco mientras rellena sus datos, se le avisa y se recargan las horas libres.

### Para el negocio (`/panel`)

- Cuenta con email y contraseña. La sesión va en una cookie `HttpOnly` y se guarda en PostgreSQL.
- **Agenda del día** con una columna por profesional, para moverse de un día a otro y cancelar citas.
- Alta del negocio desde la web. Servicios (duración y precio), equipo y horarios, por la API.

### La API

Documentada con OpenAPI en `/api/docs`.

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/negocios/{slug}` | Ficha pública: servicios y quién hace cada uno |
| `GET` | `/api/negocios/{slug}/huecos?servicio=&fecha=&profesional=` | Horas libres de un día |
| `POST` | `/api/negocios/{slug}/citas` | Reservar |
| `GET` `POST` | `/api/citas/{código}` · `/cancelar` | Consultar o cancelar con el enlace del cliente |
| `POST` | `/api/auth/registro` · `/entrar` · `/salir` | Cuenta del panel |
| `GET` `POST` | `/api/panel/negocios` | Mis negocios, alta de uno nuevo |
| `GET` | `/api/panel/negocios/{slug}/agenda?fecha=` | Citas del día |
| `GET` `POST` `PATCH` | `/api/panel/negocios/{slug}/servicios` | Servicios |
| `GET` `POST` `PUT` | `/api/panel/negocios/{slug}/profesionales` · `/{id}/horario` | Equipo y horario semanal |

## Decisiones técnicas

### Dos personas no pueden quedarse con el mismo hueco

Comprobar "¿está libre?" y luego insertar no basta: dos peticiones a la vez pasan las dos la comprobación. La garantía la da PostgreSQL con una **restricción de exclusión**:

```sql
ALTER TABLE citas ADD CONSTRAINT citas_sin_solapes
  EXCLUDE USING gist (profesional_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
  WHERE (estado = 'CONFIRMADA');
```

Si dos reservas chocan, la segunda falla con el error `23P01` y la API prueba con el siguiente profesional libre a esa hora, o responde `409`. Hay un test que lanza diez reservas a la vez para el mismo hueco y comprueba que entra exactamente una, y otro que inserta un solape directamente en la base de datos, saltándose la API, y comprueba que también se rechaza. Las citas canceladas no cuentan, y el intervalo `[inicio, fin)` deja que una cita empiece justo cuando acaba otra.

### Nadie puede llenar la agenda de citas falsas

Reservar no pide cuenta, así que hay dos límites, los dos en PostgreSQL para que valgan con varias instancias y tras un reinicio:

- **Por teléfono:** como mucho **3 citas pendientes** (confirmadas y por venir) por teléfono en cada negocio. Se comparan los nueve últimos dígitos, así que `600 123 456`, `+34600123456` y `0034 600 123 456` son el mismo. Para que dos reservas a la vez con el mismo teléfono no vean las dos "2 de 3", la reserva es una transacción que empieza con `pg_advisory_xact_lock` sobre el negocio y el teléfono; cada inserción va en su propio punto de guardado, para poder seguir probando con otro profesional si choca. Al pasar del límite responde `422` y el cliente puede cancelar alguna cita desde su enlace.
- **Por IP:** como mucho **20 intentos de reserva por hora** desde una misma IP, contando también los que fallan. Es una ventana fija en la tabla `limites`, y contar es una sola sentencia (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), así que dos peticiones a la vez no leen la misma cuenta. Al pasarse responde `429` con `Retry-After`. La IP no se guarda en claro: la clave es su SHA-256.

Sacar la IP real detrás de un proxy tiene trampa: `X-Forwarded-For` lo puede escribir el cliente. Express solo se fía de los proxies de la red local (el nginx del `docker compose`), y se puede cambiar con `TRUST_PROXY`. En Render, que añade a esa cabecera lo que mande el cliente sin limpiarlo, la IP se lee de `True-Client-IP` (la pone Cloudflare) con `CABECERA_IP_CLIENTE`. Hay tests de que cambiar `X-Forwarded-For` no sirve para saltarse el límite.

### Zonas horarias

Los horarios son hora local del negocio ("de 9:30 a 13:30") y las citas son instantes (`timestamptz`). El cálculo de huecos (`disponibilidad.ts`) es una función pura que convierte cada tramo a instantes con la zona del negocio, así que el mismo horario empieza a las 8:30 UTC en invierno y a las 7:30 UTC en verano. Tiene tests de los dos días de cambio de hora: el de 25 horas y el de 23.

### Sesiones y seguridad

- `@nestjs/authentication`: contraseñas con **scrypt**, sesión en una cookie `__Host-` `HttpOnly`, `Secure` y `SameSite=Lax`, y en la base de datos solo el SHA-256 del token. Las sesiones viven en PostgreSQL a través de un almacén propio con Drizzle, así que sobreviven a un reinicio.
- Protección **CSRF** en todas las escrituras (`enableCsrfProtection`).
- Un negocio de otro dueño responde `404`, igual que uno que no existe, para no confirmar qué negocios hay.
- El código de cada cita son 128 bits aleatorios: el enlace del cliente no se puede adivinar.

### Datos y validación

- **Drizzle** con `@nestjs/drizzle`: el esquema en TypeScript y las migraciones en SQL generadas con drizzle-kit, más una escrita a mano para la restricción de exclusión.
- Validación con **Zod** a través del `StandardSchemaValidationPipe` de Nest. Los mismos esquemas generan la documentación OpenAPI.
- Reglas también en la base de datos (`CHECK` de duraciones, tramos y precios), por si alguien se salta la API.

### Tests

- **API:** 13 tests unitarios del cálculo de huecos y 34 e2e que arrancan la aplicación de verdad contra **PGlite** (PostgreSQL compilado a WebAssembly) con las migraciones reales. No hace falta Docker para pasarlos.
- **Web:** 9 tests con Vitest y Testing Library, entre ellos el flujo completo de reserva.
- **CI:** lint (oxlint), formato (Prettier), tests y compilación de las dos partes, y un tercer trabajo que levanta el `docker compose` completo con PostgreSQL 17, carga la demo y comprueba la API, la web y el inicio de sesión a través de nginx. Un cuarto trabajo hace lo mismo con la imagen de la demo pública.

## Cómo arrancarlo

### Con Docker

```bash
docker compose up --build
docker compose exec api node dist/db/semilla.js   # la barbería de demostración
```

Abre `http://localhost:8080/r/barberia-el-tupe` para reservar como cliente y `http://localhost:8080/panel` para ver la agenda con la cuenta de demostración:

- Email: `demo@hueco.dev`
- Contraseña: `demo-hueco-2026`

### Demo pública (Render)

El `Dockerfile` de la raíz mete la web compilada dentro de la imagen de la API, que la sirve en el mismo origen (`CARPETA_WEB`): un solo servicio, sin nginx. `render.yaml` lo despliega en el plan gratuito de Render y, cada vez que arranca, vuelve a cargar la barbería de demostración. La base de datos va aparte (por ejemplo Neon): solo hay que poner su `DATABASE_URL` con `?sslmode=require`.

```bash
docker build -t hueco .
docker run -p 3000:3000 -e DATABASE_URL=postgres://... -e COOKIE_SEGURA=false hueco
```

### Para desarrollar

Necesitas Node 24 y PostgreSQL 17 (vale el del `docker compose`: `docker compose up -d db`).

```bash
cd api && npm install
npm run semilla       # migraciones y datos de demostración
npm run start:dev     # API en localhost:3000, documentación en /api/docs

cd web && npm install
npm run dev           # web en localhost:5173 (las llamadas a /api van a la API)
```

Variables de la API: `DATABASE_URL` (por defecto `postgres://hueco:hueco@localhost:5432/hueco`), `PORT`, `COOKIE_SEGURA=false` si se sirve por HTTP desde un host que no sea `localhost`, `TRUST_PROXY` y `CABECERA_IP_CLIENTE` (ver los límites de reservas) y `CARPETA_WEB` para servir la web desde la API.

### Tests

```bash
cd api && npm test && npm run test:e2e
cd web && npm test
```

## Tecnologías

| Parte | Tecnologías |
|---|---|
| API | NestJS 12, TypeScript, Drizzle ORM, PostgreSQL 17, Zod, `@nestjs/authentication`, OpenAPI, Vitest, PGlite |
| Web | React 19, Vite, React Router, TanStack Query, Vitest, Testing Library |
| Infraestructura | Docker, Docker Compose, nginx, GitHub Actions, Render |

## Hoja de ruta

- [x] **Fase 1:** reservas sin solapes, horarios con jornada partida, enlace de la cita, agenda del panel, tests y CI
- [ ] **Fase 2:** servicios, equipo y horarios desde el panel; días festivos y vacaciones de cada profesional
- [ ] **Fase 3:** recordatorio por email el día antes y aviso al negocio de cada reserva
- [x] **Fase 4:** límite de reservas por IP y teléfono, e imagen y `render.yaml` para la demo pública

## Autor

**Raúl Núñez González**: [portfolio](https://raulnugo06.github.io) · [LinkedIn](https://www.linkedin.com/in/raulnugo06) · [GitHub](https://github.com/RaulNuGo06)
