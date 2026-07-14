# Spec Draft — Mapa maestro del sistema Kardex (muni-ica-kardex)

> **Qué es esto:** un documento-mapa (borrador), **no** un spec formal. Reúne todo lo que ya se sabe del sistema para que puedas correr la skill `/spec` **una vez por cada spec del roadmap**, en orden, y responder rápido su fase de preguntas.
>
> **Cómo usarlo:** cuando arranques un spec, invoca `/spec` con el objetivo de una frase de la ficha correspondiente (más abajo) y usa el bloque **Alcance In/Out**, **Datos clave** y **Criterios** de esa ficha para contestar la Fase 2. Los criterios y el modelo de datos aquí son **tentativos**: `/spec` los refina contigo.
>
> Este archivo vive en la raíz a propósito: no interfiere con la numeración `NN-` que `/spec` crea dentro de `specs/`.

---

## 1. Contexto del dominio

Sistema de **kardex / almacén** para la Municipalidad de Ica. Un kardex registra cada **movimiento** de un producto (entrada o salida) y mantiene el **stock actual**. Las **salidas** se entregan a un **área** destinataria y pueden generar un **vale en PDF**. Por ahora las áreas y productos son **ficticios** (datos de ejemplo para demostrar el flujo).

Tres roles:
- **superadmin** — cuenta **raíz** protegida. Se crea por **seed** (no desde la UI) y **nunca** se puede eliminar ni cambiar de rol. Comparte todas las capacidades del admin, incluida la gestión de usuarios.
- **admin** — operaciones del sistema: catálogo, áreas, movimientos, PDF, dashboard **y gestión de usuarios** (crea, edita y elimina cuentas, salvo al superadmin).
- **usuario** — solo lectura de **su** historial (lo que su área ha recibido).

---

## 2. Stack y decisiones globales (asumidas)

Para no repetir esto en cada spec. Son las decisiones de base; cada spec puede matizarlas.

- **Framework:** Next.js 16.2.10 (App Router) + React 19 + TypeScript strict.
- **UI:** Tailwind v4 (config CSS-first en `app/globals.css`) + shadcn estilo `base-luma` / baseColor `mist` (sobre Base UI, no Radix), iconos `@remixicon/react`. Tema teal ya configurado. Alias `@/*`.
- **Backend:** **Supabase** — Auth + Postgres + RLS. Cliente SSR con `@supabase/ssr` (helpers browser / server + refresco de sesión en `proxy.ts`). Paquetes ya instalados; falta el wiring (Spec 01). Project ref y `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ya en `.env`.
  - ⚠️ **Next.js 16:** el antiguo `middleware.ts` se llama ahora **`proxy.ts`** (función `proxy`, runtime nodejs, sin edge). Es donde va el refresco de sesión de Supabase.
- **Roles:** tabla `profiles` con columna `role` (`'superadmin' | 'admin' | 'usuario'`), poblada por trigger al crear el usuario en `auth.users`. Autorización con RLS (nunca solo en el cliente). Existe **un único** superadmin, sembrado por seed, no editable ni eliminable desde la UI.
- **Datos ficticios:** vía script `seed` de Supabase (áreas y productos de ejemplo). No hardcodear en el front.
- **Formularios/validación:** **`react-hook-form` + `zod` + `@hookform/resolvers`** — decidido e introducido en el **Spec 03** (primer spec con formularios); convención para todos los formularios siguientes.
- **Almacenamiento de archivos — Supabase Storage (desde Spec 03):** las **imágenes de producto** (opcionales) se optimizan en el **cliente** con `browser-image-compression` (WebP, ≤~1024px, ≤~300KB) y se suben a un **bucket público** `productos` (lectura abierta; escritura solo admin por RLS de Storage). Se guarda el `path` del objeto, no la URL.
- **Tests:** unit / componentes con **Vitest + React Testing Library** (`vitest.config.mts`, plugin SWC, jsdom). Archivos `*.test.ts(x)` junto al código. E2E con **Playwright** a futuro, cuando exista el auth (Spec 01), para flujos con cookies/redirects que Vitest no cubre. Detalle en `CLAUDE.md`.
- **⚠️ Decisión abierta — PDF (Spec 06):** no hay librería instalada. Recomendación: **`@react-pdf/renderer`** generando el vale en una server action / route handler (control total del layout, render en servidor). Alternativa: `pdf-lib` (más bajo nivel) o HTML→print. Se decide al llegar al Spec 06.
- **Consulta obligatoria a `context7`** antes de escribir código de cualquier librería (Next tiene breaking changes en esta versión; Supabase cambia seguido).

---

## 3. Glosario / entidades

| Entidad | Qué es |
|---------|--------|
| `profiles` | Perfil de cada usuario de `auth.users`: nombre, rol (`superadmin`/`admin`/`usuario`), área a la que pertenece. |
| `categorias` | Agrupación de productos (ej. "Hojas bond", "Perecibles", "Útiles de oficina"). |
| `productos` | Ítem de almacén con SKU, stock actual, y —si es perecible— fecha de caducidad. |
| `areas` | Área/oficina destinataria de las salidas (ficticias por ahora). |
| `movimientos` | Registro de una entrada o salida: producto, cantidad, área destino, usuario, fecha, motivo. Es el kardex. |

---

## 4. Modelo de datos preliminar

Nombres reales en `snake_case`, IDs `uuid`. **Tentativo** — cada spec confirma el suyo. Timestamps (`created_at`) implícitos en todas.

```sql
-- profiles  (Spec 02) — 1:1 con auth.users
id           uuid PK  references auth.users(id)
nombre       text
role         text     check (role in ('superadmin','admin','usuario'))  default 'usuario'
area_id      uuid     references areas(id)  null   -- área del usuario (para su historial)
-- Regla: existe UN solo superadmin (sembrado por seed). Nunca se elimina; no se crea desde la UI.

-- categorias  (Spec 03)
id           uuid PK
nombre       text unique          -- "Hojas bond", "Perecibles", ...
descripcion  text null

-- productos  (Spec 03)
id             uuid PK
sku            text unique
nombre         text
categoria_id   uuid references categorias(id)
stock_actual   int  default 0       -- lo mueve Spec 05, no se edita a mano
stock_minimo   int  default 0       -- umbral para alerta de stock bajo (dashboard)
es_perecible   boolean default false
fecha_caducidad date null           -- opcional; solo se permite si es_perecible
imagen_path    text null            -- ruta en bucket público de Storage (Spec 03); null si no tiene imagen

-- areas  (Spec 04)
id           uuid PK
nombre       text unique            -- "Logística", "Contabilidad", ... (ficticias)
responsable  text null

-- movimientos  (Spec 05) — el kardex
id           uuid PK
tipo         text check (tipo in ('entrada','salida'))
producto_id  uuid references productos(id)
cantidad     int  check (cantidad > 0)
area_id      uuid references areas(id) null   -- destino (obligatorio en salidas)
usuario_id   uuid references auth.users(id)   -- quién registró el movimiento
motivo       text null
fecha        timestamptz default now()
```

**Regla de oro:** `productos.stock_actual` **solo** cambia por un movimiento, dentro de una transacción/RPC atómica (Spec 05). Nunca se edita directo.

---

## 5. Roadmap de specs — **8 specs**

Cada requisito del sistema se separó en una feature cohesiva (objetivo de una frase, commit-eable por separado, como exige `/spec`).

| Nº | Título | Objetivo (1 frase) | Depende de |
|----|--------|--------------------|-----------|
| 01 | Autenticación y fundación Supabase | Configurar el cliente SSR de Supabase y permitir login/logout con sesión y rutas protegidas. | — |
| 02 | Roles y layout por rol | Distinguir superadmin, admin y usuario con perfiles + RLS y mostrar el layout que corresponde a cada rol. | 01 |
| 03 | Catálogo: categorías y productos | Gestionar (CRUD) categorías y productos, incluyendo perecibles con fecha de caducidad. | 02 |
| 04 | Áreas y gestión de usuarios | Permitir gestionar áreas destinatarias y que admin y superadmin creen, editen y eliminen cuentas (salvo al superadmin). | 02 |
| 05 | Movimientos de kardex y stock | Registrar entradas/salidas que actualizan el stock de forma atómica y quedan en el historial. | 03, 04 |
| 06 | Vale de salida en PDF | Generar el vale de salida en PDF descargable a partir de un movimiento de salida. | 05 |
| 07 | Dashboard del admin | Mostrar productos más y menos pedidos, próximos a caducar y stock bajo. | 03, 05 |
| 08 | Vista de usuario: mi historial | Mostrar al usuario, en solo lectura, el historial de movimientos que le corresponden. | 02, 05 |

### Roles y permisos

| Acción | superadmin | admin | usuario |
|--------|:----------:|:-----:|:-------:|
| Crear / editar / eliminar usuarios y admins | ✅ | ✅ | ❌ |
| Ser eliminado | ❌ nunca | ✅ (por admin o superadmin) | ✅ (por admin o superadmin) |
| Cambiar de rol | ❌ nunca | ✅ | ✅ |
| Catálogo, áreas, movimientos, PDF, dashboard | ✅ | ✅ | ❌ |
| Ver historial propio | ✅ | ✅ | ✅ (solo el suyo) |

superadmin y admin comparten **todas** las capacidades, incluida la gestión de usuarios (crear, editar y eliminar cuentas). La **única** diferencia: al superadmin **nadie** puede eliminarlo ni cambiarle el rol. El superadmin es único, sembrado por seed e ineliminable, por lo que —aunque un admin elimine al resto de cuentas— siempre queda una cuenta raíz para recuperar el control.

**Cobertura de tus requisitos:**

| Requisito que pediste | Spec(s) |
|-----------------------|---------|
| 3 roles (superadmin / admin / usuario) | 02 |
| admin y superadmin agregan/editan/eliminan cuentas; nunca se elimina ni degrada al superadmin | 02 (roles + RLS) + 04 (UI) |
| Usuario solo ve su historial | 08 |
| Productos categorizados + perecibles (caducan) | 03 |
| Cada salida genera un PDF | 06 |
| Actualizar el almacén (stock) | 05 |
| Historial "a quién se le da" + áreas y productos ficticios | 04 (áreas) + 05 (movimientos) + seed |
| Dashboard: más pedidos / menos pedidos / caducidad | 07 |

**Costuras flexibles (tú decides al correr `/spec`):**
- **01 + 02** se pueden fusionar en un solo spec de "auth con roles" → quedarían **7**. Recomiendo separarlos: login/sesión es una preocupación; roles + layout es otra.
- **04** se puede partir en "Áreas" y "Gestión de usuarios" → quedarían **9**. Recomiendo unirlos: son configuración de administración y comparten `area_id`.

---

## 6. Fichas por spec

Cada ficha trae lo mínimo para arrancar `/spec` sin ambigüedad. Los criterios son booleanos y tentativos.

### Spec 01 — Autenticación y fundación Supabase
- **Objetivo:** Configurar el cliente SSR de Supabase y permitir login/logout con sesión y rutas protegidas.
- **Depende de:** —
- **In:** helpers `lib/supabase/{client,server}.ts`; `proxy.ts` en la raíz (antes `middleware.ts` en Next ≤15) que refresca la sesión; página `/login` (email+password); logout; redirección de rutas privadas a `/login` si no hay sesión.
- **Out:** roles y autorización por rol (→ 02); registro público de usuarios (los crea el superadmin, → 04); recuperación de contraseña.
- **Datos clave:** ninguna tabla nueva propia; usa `auth.users` de Supabase.
- **Criterios (tentativos):**
  - [ ] Un usuario con credenciales válidas inicia sesión y llega a una ruta privada.
  - [ ] Sin sesión, cualquier ruta privada redirige a `/login`.
  - [ ] El logout borra la sesión y vuelve a `/login`.
  - [ ] La sesión persiste al recargar (el `proxy.ts` la refresca).
- **Decisiones abiertas:** ¿autenticación solo email+password (recomendado) o también magic link?

### Spec 02 — Roles y layout por rol
- **Objetivo:** Distinguir superadmin, admin y usuario con perfiles + RLS y mostrar el layout que corresponde a cada rol.
- **Depende de:** 01
- **In:** tabla `profiles` con `role` en `('superadmin','admin','usuario')` (+ trigger que crea el perfil al alta en `auth.users`); **seed del único superadmin**; RLS que refleja las reglas (admin y superadmin gestionan usuarios; al superadmin nadie lo elimina ni le cambia el rol); lectura del rol en server; layout/shell de **admin** (navegación completa, incluida gestión de usuarios) y shell de **usuario** (mínimo) — el superadmin ve el mismo shell que el admin; redirección por rol tras login.
- **Out:** el CRUD de cada módulo (viene en 03–08); la UI de gestión de usuarios (→ 04); cualquier modo de "tomar/simular rol" (descartado).
- **Datos clave:** `profiles(id, nombre, role, area_id)`; ver la matriz de permisos en §5.
- **Criterios (tentativos):**
  - [ ] Tras el seed existe exactamente un usuario con rol `superadmin`.
  - [ ] `profiles.role` solo admite `superadmin`, `admin` o `usuario`.
  - [ ] Al crear un usuario en `auth.users` se crea su fila en `profiles`.
  - [ ] Un admin y un superadmin ven el shell de admin (con gestión de usuarios); un usuario ve el shell de usuario.
  - [ ] Un usuario que entra a una ruta de admin es rechazado (RLS + guard de ruta).
  - [ ] La RLS permite crear/editar/eliminar cuentas a admin y superadmin, y a nadie más; e impide eliminar o degradar de rol al superadmin.
  - [ ] El rol se lee en el servidor, no solo en el cliente.
- **Decisiones abiertas:** rol por defecto de un usuario nuevo (recomendado `usuario`).
- **Decisiones cerradas:** un único superadmin sembrado por seed (no se crea desde la UI); admin y superadmin gestionan usuarios por igual; al superadmin nadie lo elimina ni le cambia el rol; sin impersonación/simulación de rol.

### Spec 03 — Catálogo: categorías y productos
- **Objetivo:** Gestionar (CRUD) categorías y productos, incluyendo perecibles con fecha de caducidad.
- **Depende de:** 02
- **In:** tablas `categorias` y `productos` + RLS (admin escribe); páginas admin de listado/alta/edición/baja de categorías y productos; campos de perecible (`es_perecible`, `fecha_caducidad` **opcional**); **imagen de producto opcional** optimizada en el navegador (WebP) y subida a un bucket público de Supabase Storage; seed de categorías y productos ficticios; primera integración de formularios (`react-hook-form` + `zod`).
- **Out:** mover stock (lo hace 05; aquí `stock_actual` arranca en un valor inicial, no se opera); lotes múltiples por producto (a futuro).
- **Datos clave:** `categorias`, `productos` (ver §4).
- **Criterios (tentativos):**
  - [ ] El admin crea, edita y elimina una categoría.
  - [ ] El admin crea un producto con SKU único y lo asigna a una categoría.
  - [ ] Marcar un producto como perecible obliga a capturar `fecha_caducidad`.
  - [ ] El seed carga al menos N categorías y N productos ficticios.
- **Decisiones cerradas (ver spec formal `specs/03-catalogo-categorias-productos.md`):** SKU **manual o autogenerado** (del nombre), único y en mayúsculas; **stock inicial capturado al crear** + `stock_minimo` en el form; categoría **obligatoria**; borrado **físico** pero sin poder eliminar categorías con productos; perecible con **una** fecha **opcional**; **imagen opcional** optimizada en cliente + Storage público. **Ajustes posteriores a la aprobación:** se **eliminó** el campo `unidad`; la lista de productos tiene **filtro/orden en cliente**; el nombre se guarda **capitalizado**. Lotes múltiples: a futuro.

### Spec 04 — Áreas y gestión de usuarios
- **Objetivo:** Permitir gestionar áreas destinatarias y que admin y superadmin creen, editen y eliminen cuentas (salvo al superadmin).
- **Depende de:** 02
- **In:** tabla `areas` + CRUD (admin y superadmin); seed de áreas ficticias; pantalla de **gestión de usuarios visible para admin y superadmin**: crear usuario (email, nombre, rol `admin`/`usuario`, área), editar y eliminar admins/usuarios, usando la Admin API de Supabase desde el servidor (service role); asignar `area_id` al perfil.
- **Out:** crear/eliminar superadmins desde la UI (el superadmin es único y sembrado); eliminar o cambiar de rol al superadmin; invitaciones por correo / auto-registro; permisos finos más allá de los 3 roles.
- **Datos clave:** `areas`; escribe en `auth.users` + `profiles` (admin y superadmin).
- **Criterios (tentativos):**
  - [ ] admin y superadmin ven y usan la pantalla de gestión de usuarios.
  - [ ] admin o superadmin crea un usuario con rol (`admin` o `usuario`) y área; ese usuario puede iniciar sesión.
  - [ ] admin y superadmin editan y eliminan admins y usuarios.
  - [ ] El superadmin **no** aparece como eliminable ni degradable de rol, y cualquier intento es rechazado (RLS + guard).
  - [ ] La creación/edición/eliminación de usuarios ocurre en el servidor (service role nunca expuesto al cliente).
  - [ ] admin y superadmin crean, editan y eliminan áreas; el seed carga áreas ficticias.
- **Decisiones abiertas:** ¿contraseña inicial fijada por quien crea la cuenta o generada/temporal?; ¿un usuario pertenece a **una** área o varias? (recomendado: una).

### Spec 05 — Movimientos de kardex y stock
- **Objetivo:** Registrar entradas y salidas que actualizan el stock de forma atómica y quedan en el historial.
- **Depende de:** 03, 04
- **In:** tabla `movimientos`; función/RPC transaccional que inserta el movimiento y ajusta `productos.stock_actual` (entrada suma, salida resta); validación de stock suficiente en salidas; pantalla admin para registrar entrada y salida (salida elige **área** destino); vista de **historial/kardex por producto**.
- **Out:** el PDF del vale (→ 06); el dashboard/agregados (→ 07); la vista del usuario (→ 08); anulación/reversa de movimientos (a futuro).
- **Datos clave:** `movimientos` (ver §4); muta `productos.stock_actual`.
- **Criterios (tentativos):**
  - [ ] Registrar una entrada de N incrementa `stock_actual` en N.
  - [ ] Registrar una salida de N a un área decrementa `stock_actual` en N.
  - [ ] Una salida mayor al stock disponible es rechazada (stock nunca queda negativo).
  - [ ] El ajuste de stock y el insert del movimiento ocurren en una sola transacción (atómico).
  - [ ] El historial de un producto lista sus movimientos en orden cronológico.
- **Decisiones abiertas:** ¿se permite editar/anular un movimiento? (recomendado: no editar; anulación como movimiento inverso, a futuro).

### Spec 06 — Vale de salida en PDF
- **Objetivo:** Generar el vale de salida en PDF descargable a partir de un movimiento de salida.
- **Depende de:** 05
- **In:** endpoint/server action que toma un movimiento de salida y produce un PDF con datos del producto, cantidad, área destino, fecha, usuario y folio; botón de descarga desde el detalle/historial de la salida.
- **Out:** envío del PDF por correo; plantillas configurables; PDF de entradas o de reportes agregados.
- **Datos clave:** ninguna tabla nueva (lee `movimientos` + `productos` + `areas`); opcional guardar el PDF en Supabase Storage.
- **Criterios (tentativos):**
  - [ ] Desde una salida existente se descarga un PDF válido.
  - [ ] El PDF muestra producto, cantidad, área, fecha, usuario y un folio identificable.
  - [ ] Generar el PDF no altera el stock ni el movimiento.
- **Decisiones abiertas:** **librería** (`@react-pdf/renderer` recomendado vs `pdf-lib`); ¿se archiva el PDF en Storage o se genera al vuelo?

### Spec 07 — Dashboard del admin
- **Objetivo:** Mostrar al admin productos más y menos pedidos, próximos a caducar y stock bajo.
- **Depende de:** 03, 05
- **In:** página de dashboard admin con: ranking de productos más pedidos y menos pedidos (por suma de salidas en un rango), lista de productos próximos a caducar, lista de productos bajo `stock_minimo`; consultas agregadas (SQL/vistas) y visualización (tarjetas + gráfico).
- **Out:** exportar reportes; filtros avanzados/BI; métricas por usuario.
- **Datos clave:** ninguna tabla nueva; agrega `movimientos` y `productos` (posibles vistas SQL).
- **Criterios (tentativos):**
  - [ ] El "más pedido" refleja el producto con mayor cantidad total de salidas en el periodo.
  - [ ] El "menos pedido" refleja el de menor cantidad de salidas.
  - [ ] Se listan los productos perecibles cuya `fecha_caducidad` está dentro del umbral (ej. 30 días).
  - [ ] Se listan los productos con `stock_actual` ≤ `stock_minimo`.
- **Decisiones abiertas:** rango de tiempo por defecto (recomendado: últimos 30 días); umbral de "próximo a caducar" (recomendado: 30 días); librería de gráficos (recharts / shadcn charts).

### Spec 08 — Vista de usuario: mi historial
- **Objetivo:** Mostrar al usuario, en solo lectura, el historial de movimientos que le corresponden.
- **Depende de:** 02, 05
- **In:** página del rol usuario que lista, en solo lectura, las salidas dirigidas a su `area_id` (o registradas por él, según se defina); RLS que garantiza que solo ve lo suyo.
- **Out:** cualquier acción de escritura; ver datos de otras áreas; dashboard.
- **Datos clave:** ninguna tabla nueva (lee `movimientos` filtrado por `area_id` del perfil).
- **Criterios (tentativos):**
  - [ ] El usuario ve solo los movimientos de su área (verificado por RLS, no solo por UI).
  - [ ] El usuario no puede crear ni editar ningún movimiento.
  - [ ] La lista muestra producto, cantidad y fecha de cada entrega.
- **Decisiones abiertas:** ¿"su historial" = movimientos de **su área** o los que **él** registró? (recomendado: de su área).

---

## 7. Orden e implementación

Grafo de dependencias:

```
01 ──► 02 ──┬──► 03 ──┬──► 05 ──┬──► 06
            │         │         ├──► 07  (también depende de 03)
            └──► 04 ──┘         └──► 08  (también depende de 02)
```

Orden recomendado: **01 → 02 → 03 → 04 → 05 → 06 → 07 → 08**. Cada uno se implementa con `/spec-impl` en su propia rama `spec-NN-slug`.

Flujo por spec:
1. `/spec` con el objetivo de la ficha → contesta la Fase 2 con esta guía → se guarda `specs/NN-slug.md` en estado **Draft**.
2. Relee el spec y cambia el estado a **Approved** (o `Aprobado`) a mano — es una compuerta humana.
3. `/spec-impl NN-slug` → crea la rama e implementa paso a paso.

---

## 8. Preguntas transversales que conviene tener pensadas

`/spec` las preguntará en varias fichas; ten la respuesta lista:

- **Unidades de medida:** el campo `unidad` se **eliminó** del producto (ajuste posterior al Spec 03); el catálogo ya no maneja unidad de medida.
- **Borrado:** ¿baja física o lógica (soft-delete) en productos/áreas? Ojo: no se puede borrar un producto con movimientos.
- **Stock inicial:** ¿se captura al crear el producto (Spec 03) o siempre entra por una "entrada" (Spec 05)? (recomendado: por entrada, para que todo quede en el kardex).
- **Zona horaria / formato de fecha:** Perú (America/Lima); fechas en formato local.
- **Auditoría:** ¿basta `usuario_id` + `fecha` en movimientos o se quiere log más amplio? (recomendado: lo básico por ahora).
- **Bootstrap del superadmin:** el único superadmin se crea por **seed** (SQL / consola de Supabase), no desde la UI. Es la cuenta raíz protegida; si algo se rompe con las cuentas, siempre puede entrar y recuperar el control.
- **Sin impersonación de roles (decidido):** ni admin ni superadmin tienen un modo "tomar/simular rol". Se buscó lo más simple.
- **Seguridad:** toda autorización se valida con **RLS** en Supabase, nunca solo en el cliente. La regla "admin y superadmin gestionan usuarios, pero al superadmin nadie lo elimina ni le cambia el rol" se impone en la base, no solo en la interfaz.
```
