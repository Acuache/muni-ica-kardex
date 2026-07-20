# SPEC 08 — Vista de usuario: mi historial

> **Estado:** Aprobado
> **Depende de:** SPEC 02, SPEC 05, SPEC 06.1
> **Fecha:** 2026-07-20
> **Objetivo:** Dar al rol `usuario` una vista de solo lectura con las salidas entregadas a su área, agrupadas por lote, garantizada por RLS.

---

## 1. Por qué existe este spec

El kardex, el vale y el dashboard sirven al admin. El rol `usuario` existe desde el Spec 02, pero solo como un shell mínimo (`app/usuario/`) con un dashboard *placeholder* que no muestra ningún dato — su propio comentario dice que "la vista real llega en su propio spec". Este es ese spec: le da al usuario su única razón para iniciar sesión, ver **qué se entregó a su área**.

Ser la primera lectura del rol `usuario` impone dos cosas que el resto de la app no necesitaba:

1. **La RLS del rol `usuario`, reservada desde el Spec 05.** Hoy `movimientos_select` y `lotes_select` solo permiten `is_admin()`: un usuario no lee **ninguna** fila de esas tablas. Este spec añade la política de lectura acotada al área del usuario. La autorización vive en la base, no en la interfaz: la UI de solo lectura es una comodidad, no la barrera.
2. **El vínculo es el área, no el autor.** `movimientos.usuario_id` es el **admin** que corrió la RPC `registrar_movimiento`; el usuario nunca registra nada. Lo que ata a un usuario con una entrega es `movimientos.area_id = profiles.area_id`. Y como **solo las salidas** llevan `area_id` (las entradas lo tienen en `null` por el `check` del Spec 05), el criterio "de mi área" ya deja fuera las entradas sin lógica extra: el usuario ve lo que **recibió**, no cómo se abasteció el almacén.

---

## 2. Alcance

**In:**

- **Helper SQL `mi_area_id()`** (`security definer stable`, espejo de `is_admin()`): devuelve el `area_id` del perfil del `auth.uid()`, o `null` si no tiene área / no hay sesión.
- **Política RLS `movimientos_select_usuario`** (`select`, **permisiva**, se suma a la del admin): un `usuario` lee las filas cuya `area_id = mi_area_id()`. Como solo las salidas tienen `area_id`, ve solo salidas de su área; un usuario sin área (`area_id` nulo) no ve nada.
- **Política RLS `lotes_select_usuario`**: un `usuario` lee un lote si contiene un movimiento de su área (`exists`). Necesaria para mostrar el correlativo `L-000001`, que vive en `lotes`.
- **Página `/usuario/dashboard`** reconvertida de placeholder a **Server Component**: lee las salidas que la RLS ya restringe a su área, resuelve nombres de producto y el número de lote con `Map` (patrón de `app/admin/movimientos/page.tsx`), y pasa los datos a un cliente de solo lectura.
- **Componente `HistorialClient`** (`app/usuario/dashboard/historial-client.tsx`): tabla de **lotes con filas expandibles** (espejo de la vista admin), **buscador simple** (producto / SKU / código de lote) y orden por fecha descendente. Sin formulario, sin botón de vale, sin columna de área (todo es su área) ni de autor.
- **Helper de agrupación reutilizable** `agruparEnLotes(movs)` en `lib/movimientos/`, extraído de la lógica hoy inline en `movimientos-client.tsx:283-301`, para que admin y usuario compartan una sola fuente testeable con Vitest.
- **Estado vacío / sin área**: si el usuario no tiene `area_id`, o su área no tiene salidas, la vista muestra un mensaje claro en vez de una tabla vacía sin explicación.
- **Tests Vitest:** `agruparEnLotes` (agrupación y derivación de atributos comunes del lote), filtro del buscador, y render del `HistorialClient` (fila expandible y estado vacío).

**Fuera de alcance (para specs futuros):**

- **Descarga del vale PDF por el usuario**: decidido que **no**. El vale sigue siendo exclusivo del admin; el guard del Route Handler del Spec 06 (`app/admin/movimientos/[id]/vale/route.ts`) **no se toca**.
- **Ver entradas** o movimientos de **otras áreas**.
- **Cualquier acción de escritura** (registrar, editar, anular): no hay UI ni política `insert/update/delete` para el rol `usuario`.
- **Barra de navegación del usuario (`UsuarioNav`)**: al ser una sola vista, el historial vive en `/usuario/dashboard` sin nav. Se introduce si el rol gana más vistas.
- **Filtros avanzados** (por fecha / tipo / producto) y **paginación**: el buscador simple basta para una sola área.
- **Kardex por producto** y **stock** para el usuario: son preocupaciones de admin (Spec 05 / 07).

---

## 3. Modelo de datos

Este spec **no crea tablas**. Añade **un helper** y **dos políticas RLS**; la UI lee `movimientos` + `productos` + `areas` + `lotes` (todas ya existentes), con la RLS filtrando por área. No introduce tipos nuevos: reusa `Movimiento` y `LoteVista` de `lib/movimientos/types.ts` y `formatLote` / `padFolio` de `lib/movimientos/vale.ts`.

### Migración `0021_historial_usuario_rls.sql`

```sql
-- forma tentativa; se ajusta al implementar

-- Área del usuario que hace la petición. security definer para leer profiles
-- sin exponer la tabla; stable porque no muta. Devuelve null si el usuario no
-- tiene área (o no hay sesión) → no verá ninguna fila.
create function public.mi_area_id()
returns uuid language sql
security definer stable set search_path = ''
as $$
  select area_id from public.profiles where id = (select auth.uid())
$$;

-- LECTURA para el rol usuario: las salidas entregadas a SU área. Se SUMA
-- (permisiva) a movimientos_select (is_admin) del Spec 05; el admin sigue
-- viéndolo todo. Como solo las salidas tienen area_id (entradas → null), esta
-- política expone solo salidas del área; un usuario sin área no ve nada
-- (area_id = null nunca iguala).
create policy "movimientos_select_usuario" on public.movimientos for select
  to authenticated
  using ( area_id is not null and area_id = (select public.mi_area_id()) );

-- LECTURA de lotes para el rol usuario: un lote es visible si contiene un
-- movimiento de su área. Necesaria para mostrar el correlativo L-000001.
create policy "lotes_select_usuario" on public.lotes for select
  to authenticated
  using ( exists (
    select 1 from public.movimientos m
    where m.lote_id = lotes.id
      and m.area_id = (select public.mi_area_id())
  ) );
```

- Ambas son políticas `select` **permisivas** adicionales: Postgres las combina con **OR** con las del admin (Spec 05), así que el admin conserva su lectura total y el usuario gana la de su área — ninguna debilita a la otra.
- **Sin** política `insert` / `update` / `delete` para el `usuario`: la vista es de solo lectura y `movimientos` es inmutable desde el Spec 05 (nadie tiene update/delete).
- `mi_area_id()` usa `security definer stable set search_path = ''` y referencia `public.profiles` con esquema explícito — el mismo endurecimiento que `is_admin()` (Spec 02 / migración `0004`). Lee solo la propia fila del perfil; no expone nada de otros.
- La única fila de `lotes` que el usuario alcanza a leer expone `numero` + `created_at` (ni área, ni producto, ni autor), y es un lote que ya pertenece a su área: inofensivo.

### Reuso de tipos y agrupación — `lib/movimientos/`

La lógica que agrupa los movimientos en lotes vive hoy inline en `app/admin/movimientos/movimientos-client.tsx:283-301`. Se extrae a un helper puro compartido y su tipo se mueve a `types.ts`:

```ts
// lib/movimientos/agrupar.ts — forma tentativa; se ajusta al implementar
import type { Movimiento } from "./types"

/** Un lote con sus movimientos, para la tabla expandible (admin y usuario). */
export type LoteVista = {
  id: string
  numero: number
  tipo: TipoMovimiento
  area_id: string | null
  area_nombre: string | null
  fecha: string
  usuario_email: string | null
  movimientos: Movimiento[]
}

export function agruparEnLotes(movs: Movimiento[]): LoteVista[] { /* ... */ }
```

`LoteVista` se declara en `lib/movimientos/types.ts` (junto a `LoteResumen`); admin y usuario importan `agruparEnLotes` desde `lib/movimientos/agrupar.ts`.

---

## 4. Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir código de Supabase (RLS, funciones `security definer`), Next 16 (Server Components, `searchParams`) y shadcn.

1. **Migración RLS del usuario.** Crear `supabase/migrations/0021_historial_usuario_rls.sql` con `mi_area_id()` y las políticas `movimientos_select_usuario` y `lotes_select_usuario` de §3. *Test:* aplicar; con la sesión de un `usuario` del área X, `select from movimientos` devuelve solo salidas de X y ninguna entrada; un `usuario` sin área devuelve 0 filas; un admin sigue leyendo todo; `select from lotes` del usuario devuelve solo lotes que tocan su área; un `insert`/`update`/`delete` del usuario es rechazado por la RLS.

2. **Extraer la agrupación por lote + tipo compartido.** Mover la lógica inline de `movimientos-client.tsx:283-301` a `lib/movimientos/agrupar.ts` (`agruparEnLotes`) y el tipo `LoteVista` a `lib/movimientos/types.ts`; refactorizar el cliente admin para importarlos, **sin cambio de comportamiento**. *Test:* `npm run lint` y `npm test` pasan; la vista admin de movimientos sigue agrupando y expandiendo igual; unit test de `agruparEnLotes` (agrupa por `lote_id`, deriva tipo/área/fecha/nº de productos).

3. **Página del historial (Server Component).** Reconvertir `app/usuario/dashboard/page.tsx`: `createClient()`, leer `movimientos` (la RLS ya lo acota a las salidas de su área), resolver nombres de producto con `Map` sobre `productos` (incluidos soft-eliminados) y `numero` de lote con `Map` sobre `lotes` — espejo de `app/admin/movimientos/page.tsx`. No hace falta resolver área (una sola) ni autor. Leer `getProfile()`: si `area_id` es `null`, renderizar el estado "sin área". Construir `Movimiento[]` y pasarlo a `HistorialClient`. *Test:* con un usuario con área y salidas sembradas, la página lista sus lotes; un usuario sin área ve el mensaje "sin área asignada".

4. **Componente `HistorialClient` (solo lectura).** Crear `app/usuario/dashboard/historial-client.tsx` (`"use client"`): tabla de lotes con filas expandibles (chevron, código `L-…`, fecha, nº de productos), subtabla al expandir (folio, producto + SKU, cantidad, motivo), buscador por producto/SKU/código de lote y orden por fecha desc. Reusar `agruparEnLotes`, `formatLote`, `padFolio` y el patrón visual de `movimientos-client.tsx:566-709`, **sin** el botón "Vale", **sin** columnas de área/autor y **sin** `TipoBadge` (todo son salidas). Estado vacío cuando el buscador no arroja resultados. *Test:* render con un lote → fila colapsada; el click la expande y muestra sus productos; buscar un SKU inexistente muestra el vacío; no hay ningún control de escritura ni botón de vale.

5. **Encabezado del historial.** Ajustar la página a un encabezado claro ("Mi historial de entregas" + nombre del área del usuario), reusando el layout mínimo existente (`app/usuario/layout.tsx`, sin nav). *Test:* el usuario ve el título, su área y la lista; el botón "Cerrar sesión" del layout sigue funcionando.

6. **Verificación integral.** `npm run lint` y `npm test`, más una pasada manual con dos usuarios de áreas distintas: cada uno ve **solo** las salidas de su área, ninguna entrada, ningún lote ajeno; una **petición directa a la API** con la sesión de un usuario a datos de otra área devuelve 0 filas (RLS, no solo UI); un admin sigue viendo todo en `/admin/movimientos`. *Test:* se cumplen todos los criterios de aceptación.

---

## 5. Criterios de aceptación

- [ ] Un `usuario` con área asignada ve, en `/usuario/dashboard`, las salidas entregadas a **su** área, agrupadas por lote (`L-000001`), con filas expandibles.
- [ ] Al expandir un lote, la lista muestra por producto **folio, producto + SKU, cantidad** y **motivo** (si existe); la fila del lote muestra su **fecha**.
- [ ] Un `usuario` **no** ve entradas ni salidas de otras áreas — verificado con una **petición directa a la API** (RLS), no solo en la UI.
- [ ] Un `usuario` **sin** `area_id` ve un mensaje de "sin área asignada" y ninguna fila.
- [ ] Un `usuario` **no** puede crear, editar ni anular ningún movimiento (no hay UI ni política RLS que lo permita).
- [ ] Un `admin` / `superadmin` sigue viendo **todos** los movimientos en `/admin/movimientos` (las políticas nuevas no le restan lectura).
- [ ] El correlativo de lote se muestra como `L-000001` (reusa `formatLote`) y el folio con `padFolio`.
- [ ] El buscador filtra por producto, SKU o código de lote; el orden por fecha descendente es el defecto.
- [ ] El usuario **no** dispone del botón ni de la descarga del vale PDF (queda de admin; el guard del Route Handler no cambia).
- [ ] `mi_area_id()` devuelve el `area_id` del perfil del `auth.uid()`, o `null` si no tiene; es `security definer` con `search_path = ''`.
- [ ] La agrupación por lote vive en `lib/movimientos/` con tests, y la vista admin la reusa **sin** cambio de comportamiento.
- [ ] `agruparEnLotes` y el filtro del buscador tienen tests unitarios; el render del `HistorialClient` (fila expandible + estado vacío) tiene test.
- [ ] `npm run lint` y `npm test` pasan.

---

## 6. Decisiones

- **Sí:** historial = **salidas de mi área** (`movimientos.area_id = mi_area_id()`), no "lo que registré". El usuario nunca es autor: `usuario_id` es el admin que corrió la RPC. El vínculo real es el área destino, y como solo las salidas tienen `area_id`, el criterio ya excluye las entradas sin lógica extra.
- **No:** filtrar por `usuario_id`. No tiene sentido de dominio (el usuario no registra nada) y dejaría el historial siempre vacío.
- **Sí:** RLS como **segunda política permisiva** que se suma a la del admin, no como reemplazo. Postgres combina las permisivas con OR; el admin conserva lectura total y el usuario gana la suya. Reescribir `movimientos_select` habría arriesgado la lectura del admin.
- **Sí:** helper `mi_area_id()` `security definer`, espejo de `is_admin()`. Encapsula el `select area_id from profiles` para no repetir el subselect en cada política; el `search_path = ''` es el mismo endurecimiento del resto de funciones (migración `0004`).
- **Sí:** política de lectura también en **`lotes`**, no solo en `movimientos`. La vista muestra el código `L-000001`, que vive en `lotes`; sin esa política el usuario vería los movimientos pero no el número del lote. Se expone solo el lote que toca su área (vía `exists`).
- **No:** que el usuario **descargue el vale PDF**. Decidido en la Fase 2: el vale es un comprobante que emite y firma el almacén (admin); el guard del Route Handler (Spec 06) queda intacto. Abrirlo al usuario habría ampliado la superficie sin un pedido real.
- **Sí:** el historial **reemplaza** el dashboard placeholder (`/usuario/dashboard`), sin barra de navegación. Es la única vista del usuario; un `UsuarioNav` sería andamiaje muerto. Si el rol gana más vistas a futuro, se introduce ahí.
- **Sí:** **agrupado por lote con filas expandibles**, espejo de la vista admin. Una entrega se registra como un lote (posiblemente multiproducto, Spec 06.1); mostrarla agrupada refleja la entrega real y reusa un patrón ya probado.
- **Sí:** **extraer** la agrupación por lote a `lib/movimientos/` y compartirla entre admin y usuario. Evita dos implementaciones que diverjan y hace testeable la lógica pura (convención del repo: lógica en `lib/` con Vitest).
- **Sí:** **buscador simple + orden por fecha**, sin filtros de tipo/fecha/producto. El usuario ve una sola área y solo salidas; los filtros del admin sobran. Un buscador por producto/SKU/lote cubre el caso real (encontrar una entrega).
- **Sí:** manejar explícitamente el **usuario sin área** (`area_id` es nullable). Sin ese caso, un usuario recién creado sin área vería una tabla vacía sin explicación.
- **Consecuencia asumida:** las **entradas** nunca aparecen en el historial del usuario (no tienen `area_id`). Es lo deseado: el usuario ve lo que **recibió**, no cómo se abasteció el almacén.
- **Definición redactada de una vez (modo plan):** la Fase 2 de `/spec` se completó (cuatro decisiones cerradas en un bloque), pero el documento se redactó completo para revisarlo al final vía la aprobación del plan, en lugar de confirmar sección por sección.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una política RLS mal escrita deja que un usuario lea salidas de otras áreas. | Un criterio verifica el aislamiento con una **petición directa a la API** (no la UI) usando dos usuarios de áreas distintas; `mi_area_id()` centraliza el filtro en un solo lugar. |
| `mi_area_id()` sin `search_path` fijo abre una vía de inyección de esquema (como toda `security definer`). | Se declara `security definer stable set search_path = ''` y referencia `public.profiles` con esquema explícito, igual que `is_admin()` (Spec 02 / `0004`). |
| Añadir la política del usuario rompe o restringe la lectura del admin. | Las políticas nuevas son **permisivas** (se combinan con OR); un criterio verifica que el admin sigue viendo todo. |
| El usuario ve los movimientos pero no el código de lote porque falta la RLS en `lotes`. | Se añade `lotes_select_usuario` (vía `exists`); un criterio comprueba que `L-000001` se muestra. |
| Extraer la agrupación cambia el comportamiento de la vista admin. | El paso 2 es un refactor sin cambio funcional, cubierto por `npm test` y una revisión manual de la vista admin antes de construir la del usuario. |
| Un usuario sin área ve una tabla vacía confusa. | La página detecta `area_id === null` y muestra un estado "sin área asignada" explícito. |
| El usuario intenta `insert`/`update`/`delete` directamente por la API. | No existe ninguna política de escritura para el rol; la RLS los rechaza. La vista tampoco expone controles de escritura. |

---

## 8. Lo que **no** entra en este spec

- **Descarga del vale PDF por el usuario** (queda de admin; el guard del Route Handler no cambia).
- **Ver entradas** o movimientos de **otras áreas**.
- Cualquier **acción de escritura** del usuario.
- **Barra de navegación de usuario** (`UsuarioNav`) y vistas adicionales del rol.
- **Filtros avanzados** (fecha / tipo / producto) y **paginación**.
- **Kardex por producto** y **stock** para el usuario (son de admin, Spec 05 / 07).

Cada uno, cuando llegue, va en su propio spec.
