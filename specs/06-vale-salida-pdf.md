# SPEC 06 — Vale de salida en PDF

> **Estado:** Aprobado
> **Depende de:** SPEC 05
> **Fecha:** 2026-07-15
> **Objetivo:** Generar, desde cualquier movimiento de salida, un vale en PDF descargable con folio correlativo, firmable en papel.

---

## 1. Por qué existe este spec

El Spec 05 dejó el kardex completo **dentro** del sistema: toda salida queda registrada, es inmutable y sobrevive al borrado del producto. Pero una entrega de almacén municipal no termina en la base de datos — termina cuando alguien **firma que recibió**. Ese papel es el vale, y hoy no existe.

Este spec es la única salida del sistema hacia el mundo físico. Eso impone dos cosas que el resto de la app no necesitaba:

1. **Un folio.** `movimientos` se identifica con un `uuid`, que sirve para una FK y no para un documento: no se dicta por teléfono, no se archiva en un file y no se reclama. Un vale necesita un número correlativo. Por eso este spec añade `movimientos.folio`.
2. **Un guard propio.** El vale se sirve por un Route Handler, y los Route Handlers **no pasan por `app/admin/layout.tsx`** — el `requireRole()` que protege todas las páginas de `/admin` no los cubre (además usa `redirect()`, que en una respuesta binaria no aplica). Sin un guard explícito, `/admin/movimientos/<id>/vale` quedaría expuesto.

El PDF **no** genera un hecho nuevo: reimprime uno ya ocurrido. De ahí que se genere al vuelo, que sea idempotente y que no toque ni el stock ni el movimiento.

---

## 2. Alcance

**In:**

- **Columna `movimientos.folio`** (`bigint generated always as identity`, único, not null): correlativo sobre **toda** fila de movimientos, generado por la base y no fijable desde la app. Migración con **backfill ordenado por `fecha`** de los movimientos ya sembrados.
- **Route Handler `app/admin/movimientos/[id]/vale/route.ts`** (`GET`): guard de rol propio (admin/superadmin → si no, `403`), lee el movimiento, rechaza con `404` si no existe o si `tipo <> 'salida'`, y devuelve el PDF con `Content-Type: application/pdf` y `Content-Disposition: attachment`.
- **Componente `ValePDF`** (`app/admin/movimientos/[id]/vale/vale-pdf.tsx`) con `@react-pdf/renderer`: encabezado municipal, folio, fecha, producto + SKU, cantidad, área destino, motivo (si existe) y **dos recuadros de firma** ("Entregado por" / "Recibido por") con línea, nombre y DNI.
- **Helpers `lib/movimientos/vale.ts`**: `formatFolio` (`42` → `VALE N° 000042`), nombre de archivo (`vale-000042.pdf`) y armado de los datos del vale desde el movimiento (fallback `nombre` → `email` → `—`; fecha en `America/Lima`).
- **Botón "Vale"** como acción de fila en la tabla de `/admin/movimientos`, **solo** en filas de `tipo = 'salida'`. Sirve también al kardex por producto, que es esa misma tabla filtrada.
- **Columna "Folio"** en la tabla de movimientos, para poder localizar y reimprimir un vale por su número.
- **Dependencia nueva:** `@react-pdf/renderer` (v4.5.1; peer `react: ^19` — compatible con el React 19.2.4 del proyecto).
- **Tests Vitest:** `formatFolio` / nombre de archivo, armado de datos del vale (fallbacks, motivo nulo, zona horaria) y render de `ValePDF` con `renderToBuffer` verificando la firma `%PDF`.

**Fuera de alcance (para specs futuros):**

- **Archivar el PDF** en Supabase Storage. Se genera al vuelo en cada descarga.
- **Vale de entradas** o PDF de reportes agregados: solo las salidas tienen vale.
- **Envío del vale por correo** y **plantillas configurables**.
- **Logo / assets de marca**: el encabezado es solo texto (no hay assets en el repo).
- **Descarga del vale por el rol `usuario`**: la RLS de `select` sobre `movimientos` sigue restringida a `is_admin()` (Spec 05); el **Spec 08** decidirá si el usuario puede bajar el vale de su área.
- **Correlativo contiguo solo de salidas** (talonario sin saltos) y **numeración reiniciada por año**.
- **Dashboard** (→ Spec 07).

---

## 3. Modelo de datos

Este spec **no crea tablas**. Añade **una columna** a `movimientos` y lee `movimientos` + `productos` + `areas` + `profiles`.

### Migración `0015_movimientos_folio.sql`

El orden importa: no se puede añadir `generated always as identity` directamente sobre una tabla con filas y esperar que respete la cronología (Postgres numera en orden físico arbitrario). Se hace en tres tiempos.

```sql
-- 1. columna simple, nullable por ahora
alter table public.movimientos add column folio bigint;

-- 2. backfill de las filas existentes (seed del Spec 05) en orden cronológico
with numerados as (
  select id, row_number() over (order by fecha, created_at, id) as n
    from public.movimientos
)
update public.movimientos m
   set folio = numerados.n
  from numerados
 where m.id = numerados.id;

-- 3. cerrar: not null, identity (la app nunca fija el folio) y unicidad
alter table public.movimientos
  alter column folio set not null,
  alter column folio add generated always as identity;

-- la secuencia arranca después del último folio del backfill
select setval(
  pg_get_serial_sequence('public.movimientos', 'folio'),
  coalesce((select max(folio) from public.movimientos), 0) + 1,
  false
);

create unique index movimientos_folio_idx on public.movimientos (folio);
```

- `alter column … add generated always as identity` **exige** que la columna ya sea `not null`; de ahí el orden.
- **`generated always`** (no `by default`): un `insert` que nombre `folio` es rechazado por la base. El folio no es un dato de la aplicación.
- **La RPC `registrar_movimiento` del Spec 05 no cambia**: su `insert` no nombra `folio`, así que la identity lo asigna sola. El corazón del Spec 05 queda intacto.
- **`supabase/seed.sql` tampoco cambia**, por la misma razón: sus inserts no nombran `folio`. En una base nueva las migraciones corren antes del seed, así que el seed recibe folios 1..N en orden de inserción.
- **Huecos aceptados:** las entradas consumen folio aunque no tengan vale, así que los vales saltan números (42, 45, 46, 51…). El folio sigue siendo único e identificable.

### Tipos — `lib/movimientos/types.ts`

```ts
// se AÑADE a la fila que ya consume la UI
export type Movimiento = {
  // …campos del Spec 05…
  folio: number
}

// datos ya derivados que consume el componente del PDF
export type DatosVale = {
  folioTexto: string // "VALE N° 000042"
  fecha: string // formateada en America/Lima
  producto: string
  sku: string
  cantidad: number
  area: string
  entregadoPor: string // nombre → email → "—"
  motivo: string | null // null ⇒ la línea no se imprime
}
```

`folio` es `bigint` en Postgres y llega como `number` por PostgREST. Los folios reales viven muy por debajo de `Number.MAX_SAFE_INTEGER`; no se necesita `bigint` en JS.

---

## 4. Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir código de `@react-pdf/renderer`, Next 16 (Route Handlers, `params` como `Promise`) y Supabase.

1. **Instalar `@react-pdf/renderer` y validar el bundling.** `npm i @react-pdf/renderer`. Crear un Route Handler mínimo que devuelva un PDF de una línea y correr `npm run build`. Si el build falla al empaquetar la librería, añadir `serverExternalPackages: ['@react-pdf/renderer']` a `next.config.ts` (hoy vacío). *Test:* `npm run build` pasa y la ruta devuelve un archivo que abre en un lector de PDF.

2. **Migración del folio.** Crear `supabase/migrations/0015_movimientos_folio.sql` con los tres tiempos de §3. *Test:* aplicar; toda fila tiene `folio` único y not null; los movimientos del seed quedan numerados 1..N **en orden de fecha**; un `insert … (folio) values (999)` es rechazado; registrar un movimiento por la RPC asigna el folio siguiente sin tocar la función.

3. **Helpers del vale + tests.** Crear `lib/movimientos/vale.ts` con `formatFolio(folio)` → `VALE N° 000042` (pad a 6, sin truncar si es mayor), `nombreArchivoVale(folio)` → `vale-000042.pdf` y `construirDatosVale(...)` → `DatosVale` (fallback `nombre` → `email` → `—`; fecha con `Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima' })`). *Test:* unit tests Vitest en `lib/movimientos/vale.test.ts` — padding, folio de 7+ dígitos, nombre de archivo, los tres fallbacks de autor, motivo nulo y la fecha en zona Lima.

4. **Componente `ValePDF` + test de render.** Crear `app/admin/movimientos/[id]/vale/vale-pdf.tsx` (sin `"use client"`: no es React DOM) con `Document`/`Page`/`View`/`Text` y su `StyleSheet`: encabezado "Municipalidad Provincial de Ica" + "Vale de salida de almacén", folio, fecha, bloque de datos (producto + SKU, cantidad, área, motivo si existe) y al pie los dos recuadros de firma. *Test:* `renderToBuffer(<ValePDF datos={…} />)` devuelve un buffer no vacío que empieza con `%PDF`; un caso con `motivo: null` no imprime la etiqueta.

5. **Route Handler.** Crear `app/admin/movimientos/[id]/vale/route.ts` con `GET`: `params` es un `Promise` (Next 16); guard de rol con `getProfile()` (`admin`/`superadmin`, si no `403` — **no** `requireRole()`, que redirige); lee el movimiento con sus joins; `404` si no existe o `tipo <> 'salida'`; `renderToBuffer` y respuesta con `Content-Type: application/pdf` y `Content-Disposition: attachment; filename="vale-000042.pdf"`. *Test:* un admin descarga el vale de una salida; una entrada da 404; un id inexistente da 404; una sesión con rol `usuario` da 403; sin sesión, el proxy redirige a `/login` (307) antes del handler.

6. **UI: folio y botón.** Añadir `folio` al `select` de `app/admin/movimientos/page.tsx` y al tipo `Movimiento`; en `movimientos-client.tsx`, columna **Folio** y acción de fila **Vale** (enlace a `/admin/movimientos/<id>/vale`) visible **solo** si `m.tipo === "salida"`. *Test:* las salidas muestran el botón y descargan; las entradas no lo muestran; desde "Ver kardex" de un producto el botón también funciona.

7. **Verificación integral.** `npm run lint` y `npm test`, más una pasada manual: descargar el vale de una salida sembrada, comprobar que el stock y el movimiento no cambian, descargarlo dos veces y confirmar que sale idéntico, y bajar el vale de una salida cuyo producto fue dado de baja. *Test:* todos los criterios de aceptación se cumplen.

---

## 5. Criterios de aceptación

- [ ] Desde una fila de **salida** en `/admin/movimientos`, el botón **Vale** descarga un PDF válido (abre en un lector; el archivo empieza con `%PDF`).
- [ ] El PDF muestra **folio, fecha, producto, SKU, cantidad, área destino** y **quién entregó**.
- [ ] El PDF trae el encabezado "Municipalidad Provincial de Ica" / "Vale de salida de almacén" y **dos recuadros de firma** ("Entregado por" / "Recibido por") con línea, nombre y DNI.
- [ ] El **motivo** se imprime si existe; si es `null`, la línea **se omite** (no imprime "null" ni una etiqueta vacía).
- [ ] **Entregado por** muestra `profiles.nombre`; si está vacío cae al **email**; si `usuario_id` es `null` (cuenta eliminada) muestra **"—"**.
- [ ] El archivo descargado se llama **`vale-000042.pdf`** (folio con padding a 6).
- [ ] Las filas de tipo **entrada** **no** muestran el botón Vale, y `GET /admin/movimientos/<id de una entrada>/vale` devuelve **404**.
- [ ] `GET` del vale con rol **`usuario`** devuelve **403** y no el PDF. **Sin sesión**, el proxy (Spec 01) redirige a `/login` con **307** antes de que el handler llegue a correr. En ninguno de los dos casos sale el PDF; ambos verificados **sin pasar por la UI** (petición directa a la ruta).
- [ ] Generar el vale **no** altera `stock_actual` ni ninguna columna del movimiento.
- [ ] Descargar **dos veces** el mismo vale produce el **mismo folio y el mismo contenido** (idempotente).
- [ ] Toda fila de `movimientos` tiene un `folio` **único** y **not null**.
- [ ] Tras la migración, los movimientos del **seed** tienen folio correlativo **en orden de fecha** (el más antiguo es el 1).
- [ ] Un movimiento **nuevo** registrado desde la app recibe el folio siguiente al máximo, **sin modificar** `registrar_movimiento`.
- [ ] La app **no puede fijar ni cambiar** el folio: un `insert` que nombre `folio` es rechazado por la base (`generated always`).
- [ ] Una salida cuyo producto fue **dado de baja** (`eliminado = true`, Spec 05) **sigue** generando su vale con nombre y SKU.
- [ ] Los **acentos y la ñ** se imprimen correctamente en el PDF.
- [ ] `formatFolio` y el nombre de archivo tienen **tests unitarios** (padding, folio de 7+ dígitos).
- [ ] El armado de `DatosVale` tiene **tests** (fallback nombre → email → "—", motivo nulo, fecha en `America/Lima`).
- [ ] Un test renderiza `ValePDF` con `renderToBuffer` y verifica un buffer **no vacío** que empieza con `%PDF`.
- [ ] `npm run lint` y `npm test` pasan.

---

## 6. Decisiones

- **Sí:** **`@react-pdf/renderer`** (v4.5.1) con **`renderToBuffer`** en el servidor. El layout del vale se escribe como componentes, que es el modo en que ya se trabaja en el repo, y `renderToBuffer` es el camino documentado para devolver un PDF como respuesta HTTP. Su peer dep declara `react: ^19`, así que no choca con el React 19.2.4 del proyecto.
- **No:** **`pdf-lib`**. Obliga a posicionar cada campo por coordenadas absolutas; mantener el vale (mover una línea, alargar un nombre) sería recalcular offsets a mano.
- **No:** **HTML → `window.print()`**. No produce un archivo descargable de verdad: depende del diálogo del navegador y el resultado varía por navegador e impresora. Un comprobante municipal no puede depender de eso.
- **Sí:** **columna `folio bigint generated always as identity`**. El `uuid` del movimiento sirve para una FK, no para un documento: no se dicta, no se archiva, no se reclama. `generated always` (y no `by default`) hace **imposible** que la app fije un folio.
- **No:** usar un **prefijo corto del uuid** como folio. Evitaba la migración, pero no es correlativo ni pronunciable, y no se lee como un documento oficial.
- **No:** **correlativo contiguo solo de salidas** (talonario 1,2,3… sin saltos). Exigía una secuencia aparte con trigger o lógica dentro de `registrar_movimiento` — tocar el corazón transaccional del Spec 05 a cambio de estética de numeración. Se aceptan los **huecos**: las entradas consumen folio y los vales saltan números.
- **No:** numeración **reiniciada por año** (`2026-000042`). Más cercana al uso administrativo real, pero pide una secuencia por año y lógica de reinicio; no se justifica todavía.
- **Sí:** **backfill ordenado por `fecha`** en la migración, con `setval` al máximo+1. Postgres numera las filas existentes en orden físico arbitrario; sin esto, el seed quedaría con folios que contradicen su cronología.
- **Sí:** **generar al vuelo, sin archivar en Storage**. El movimiento es inmutable (Spec 05), así que el vale sale idéntico en cada descarga: archivarlo no añade garantía y sí un bucket, sus políticas RLS y basura acumulada.
- **Consecuencia asumida:** como no se archiva, si el layout del vale cambia en el futuro, un vale reimpreso se verá distinto al que se firmó en su día. Los **datos** serán los mismos (el movimiento no cambia); solo cambia la presentación. Se acepta.
- **Sí:** **Route Handler** (`route.ts`), no Server Action. Devolver un binario con sus headers (`Content-Type`, `Content-Disposition`) es exactamente para lo que existe un Route Handler; una Server Action tendría que serializar el PDF y disparar la descarga desde el cliente.
- **Sí:** **guard de rol explícito dentro del Route Handler**, con `getProfile()` y `403`. Los Route Handlers **no** ejecutan `app/admin/layout.tsx`, así que el `requireRole()` que protege las páginas no los cubre; además `requireRole()` hace `redirect()`, que no tiene sentido en una descarga. La RLS del Spec 05 (`movimientos_select` con `is_admin()`) es la segunda barrera: sin ella el guard sería la única defensa.
- **Corregido durante la implementación:** el spec daba por hecho que **sin sesión** la ruta respondería `403`. No lo hace: el **proxy del Spec 01** (`proxy.ts`) sí cubre los Route Handlers — a diferencia de los layouts — y redirige a `/login` con **307** antes de que el handler corra (verificado con una petición directa: `status=307 location=/login`). Se acepta ese 307 y **no se toca `proxy.ts`**: el PDF no sale igualmente, y reabrir el proxy del Spec 01 para cambiar un código de estado no lo valía. El guard del handler **sigue siendo necesario y no es decorativo**: es quien rechaza al rol `usuario` (que sí tiene sesión y por tanto pasa el proxy) y quien sostiene la ruta si el proxy cambiara.
- **Sí:** **"Entregado por" = `nombre` → `email` → `"—"`**. Un vale se firma; un nombre de persona se lee mejor que un correo. El fallback a email cubre el perfil sin completar y el "—" cubre la cuenta eliminada (`usuario_id on delete set null`, Spec 05).
- **Sí:** **el vale se emite aunque el producto esté dado de baja**. El vale reimprime un hecho pasado y la fila del producto persiste (soft-delete), así que nombre y SKU se resuelven. Bloquearlo destruiría el comprobante de una entrega que sí ocurrió — justo lo que el soft-delete vino a evitar.
- **Sí:** **botón como acción de fila, solo en salidas**. Cubre de paso el kardex por producto, que es la misma tabla filtrada, sin rutas ni diálogos nuevos.
- **No:** **descarga automática al registrar la salida**. Forzaría el archivo aunque no se quiera imprimir y no resuelve reimprimir un vale antiguo, que es el caso real.
- **Sí:** **columna Folio en la tabla** de movimientos. Sin ella el folio solo existe dentro del PDF y no habría forma de localizar un vale por el número que trae el papel.
- **Sí:** **fuente Helvetica** (la estándar de PDF, sin registrar fuentes). Cubre Latin-1, así que acentos y ñ se imprimen bien; registrar una fuente propia añadiría un asset y un paso de carga sin beneficio.
- **Definición sin revisión sección por sección:** la Fase 2 de `/spec` se completó entera (nueve decisiones cerradas en tres bloques), pero a pedido del usuario el documento se redactó de una vez para revisarlo al final, en lugar de confirmar sección por sección.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `@react-pdf/renderer` no se empaqueta bien en el build de Next 16 (es una librería de Node con dependencias binarias). | El paso 1 del plan valida el `npm run build` **antes** de escribir el vale real; si falla, se añade `serverExternalPackages: ['@react-pdf/renderer']` a `next.config.ts`. |
| El Route Handler queda **sin guard** porque se asume que el layout de `/admin` lo protege. | No lo protege: los Route Handlers no ejecutan layouts. El guard explícito con `getProfile()` + `403` es un paso del plan y un criterio de aceptación que se verifica **sin pasar por la UI**. (El proxy del Spec 01 **sí** los cubre y frena al anónimo con un 307, pero solo al anónimo: al rol `usuario` lo para el guard.) |
| El folio se asigna en orden físico arbitrario y los movimientos del seed quedan descuadrados respecto a su fecha. | La migración hace el backfill con `row_number() over (order by fecha…)` antes de convertir la columna en identity, y un criterio lo verifica. |
| La migración falla porque `add generated always as identity` exige `not null`. | El orden de la migración está fijado en §3: backfill → `set not null` → `add generated always as identity` → `setval`. |
| Añadir el folio obliga a tocar la RPC `registrar_movimiento` o el seed, reabriendo el Spec 05. | No los toca: ni la RPC ni el seed nombran `folio` en su `insert`, así que la identity lo asigna sola. |
| Los acentos y la ñ salen como cuadros en el PDF. | Helvetica (fuente estándar del formato) cubre Latin-1; hay un criterio de aceptación que lo verifica explícitamente. |
| El vale se genera para una entrada o para un id inventado. | La ruta devuelve `404` si el movimiento no existe o si `tipo <> 'salida'`; el botón solo se pinta en filas de salida. |
| Al no archivarse, un vale reimpreso tras un cambio de layout no coincide con el papel firmado. | Los datos son idénticos (movimiento inmutable); solo cambia la presentación. Asumido en Decisiones. |

---

## 8. Lo que **no** entra en este spec

- **Archivar** el PDF en Supabase Storage: se genera al vuelo.
- **Vale de entradas**, PDF de reportes agregados y **envío por correo**.
- **Plantillas configurables** y **logo / assets de marca** (el encabezado es solo texto).
- **Descarga del vale por el rol `usuario`** y su política RLS (→ Spec 08).
- **Talonario contiguo solo de salidas** y **numeración reiniciada por año**.
- El **dashboard** de más/menos pedidos, próximos a caducar y stock bajo (→ Spec 07).

Cada uno, cuando llegue, va en su propio spec.
