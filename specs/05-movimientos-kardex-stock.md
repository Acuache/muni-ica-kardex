# SPEC 05 — Movimientos de kardex y stock

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 04
> **Fecha:** 2026-07-14
> **Objetivo:** Registrar entradas y salidas que ajustan el stock de cada producto de forma atómica (función Postgres transaccional) y quedan en un historial/kardex imborrable, incluso si el producto se elimina (soft-delete).

---

## 1. Por qué existe este spec

Es el **corazón del kardex**: hasta aquí `productos.stock_actual` era un valor capturado a mano (Spec 03). Desde este spec, **el stock solo cambia por un movimiento**, y ese cambio debe ser **atómico**: insertar el movimiento y ajustar el stock tienen que ocurrir juntos o no ocurrir. Si se hicieran como dos queries separadas desde la Server Action y la segunda fallara, el stock quedaría inconsistente y el kardex mentiría. Por eso el ajuste vive en una **función Postgres (RPC) transaccional** con bloqueo de fila, no en el cliente ni en dos pasos.

Además cierra una deuda que el Spec 03 dejó anotada: **cómo borrar un producto sin perder su historial**. Un almacén municipal necesita conservar el kardex por trazabilidad; pero también da de baja productos que ya no maneja. La solución es **soft-delete**: el producto se marca como eliminado y desaparece del catálogo, pero su fila persiste, de modo que los movimientos siguen apuntando a un producto real y el kardex (y el dashboard del Spec 07) nunca quedan con huecos.

---

## 2. Alcance

**In:**

- **Tabla `movimientos`** (`id`, `tipo` `entrada`/`salida`, `producto_id`, `cantidad`, `area_id`, `usuario_id`, `motivo`, `fecha`, `created_at`) con `check`s de integridad (cantidad > 0; salida exige área; entrada sin área) y RLS.
- **Función Postgres transaccional `registrar_movimiento`** (`security invoker`) que, en una sola transacción: valida, bloquea la fila del producto (`for update`), ajusta `productos.stock_actual` (entrada suma, salida resta) e inserta el movimiento; rechaza salidas mayores al stock disponible y movimientos sobre productos eliminados. Es el **único** camino por el que cambia el stock.
- **Soft-delete de productos** (cierra la deuda del Spec 03): nueva columna `productos.eliminado boolean not null default false`; el borrado desde la UI pasa a ser **lógico** (marca `eliminado = true`), nunca físico. El SKU único se vuelve **único solo entre productos no eliminados** (índice único parcial), para poder reusar el SKU de un producto dado de baja.
- **Ajuste del catálogo (Spec 03) para respetar el soft-delete:** la lista de productos, el `select` de productos del formulario de movimientos y cualquier lectura de catálogo filtran `eliminado = false`. La Server Action `eliminar` de productos deja de borrar físicamente (y de borrar la imagen en Storage) y pasa a marcar `eliminado = true`.
- **Página de Movimientos** (`/admin/movimientos`): lista/historial global con **filtro y orden en cliente** (por producto, tipo, área y fecha) + botón **Registrar** que abre un **diálogo** (rhf + zod): tipo (entrada/salida), producto, cantidad, motivo (opcional) y —solo si es salida— área destino.
- **Vista de kardex por producto:** desde cada fila de `/admin/productos` un enlace **Ver kardex** abre `/admin/movimientos?producto=<id>` pre-filtrada por ese producto (la página lee el `searchParams`).
- **Server Action `registrar`** (`app/admin/movimientos/actions.ts`): guard `is_admin()` en servidor, validación con `movimientoSchema`, llamada a `supabase.rpc('registrar_movimiento', …)`, captura del error de **stock insuficiente** con mensaje inline, y `revalidatePath`.
- **Esquemas zod compartidos** (`lib/movimientos/schemas.ts`) y etiquetas/constantes de tipo (`lib/movimientos/constants.ts`).
- **Seed de ~10–15 movimientos ficticios** en `supabase/seed.sql` (entradas y salidas sobre los productos y áreas ya sembrados; `usuario_id` = superadmin del seed), con `stock_actual` de los productos **cuadrado** al resultado de esos movimientos.
- **Navegación:** un enlace suelto **Movimientos** en el sidebar del shell admin.

**Fuera de alcance (para specs futuros):**

- **Vale de salida en PDF** a partir de un movimiento de salida → **Spec 06**.
- **Dashboard** (productos más/menos pedidos, próximos a caducar, stock bajo) → **Spec 07**; aquí solo se genera el dato (`movimientos`) que ese dashboard agregará.
- **Vista del usuario** (historial en solo lectura de su área) → **Spec 08**; aquí la RLS de `select` sobre `movimientos` se restringe a `is_admin()`, y el Spec 08 añadirá la política para el rol `usuario`.
- **Editar o anular un movimiento:** un movimiento es **inmutable**; no hay `update`/`delete` desde la app. La reversa (como movimiento inverso) queda a futuro.
- **Retro-fechar** un movimiento: la `fecha` es siempre `now()`, no editable.
- **Lotes múltiples / control de caducidad por entrada:** una entrada no gestiona fechas de caducidad por lote; sigue siendo el único `fecha_caducidad` del producto (Spec 03).
- **Restaurar** un producto soft-eliminado desde la UI: a futuro; por ahora el soft-delete es de una vía.

---

## 3. Modelo de datos

Este spec introduce **una tabla nueva** (`movimientos`), **una función** (`registrar_movimiento`) y **modifica** `productos` (columna `eliminado` + índice único parcial de SKU). Todo por migración SQL en `supabase/migrations/`. Reusa `is_admin()` del Spec 02.

Migraciones propuestas:

- `0013_movimientos.sql` — tabla `movimientos`, sus `check`s, RLS y la función `registrar_movimiento`.
- `0014_productos_soft_delete.sql` — columna `productos.eliminado` + reemplazo del `unique(sku)` por un índice único parcial.

### Tabla `movimientos`

```sql
create table public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('entrada','salida')),
  producto_id uuid not null references public.productos(id) on delete restrict,   -- backstop: los productos se soft-eliminan, nunca se borran físicamente
  cantidad    int  not null check (cantidad > 0),
  area_id     uuid references public.areas(id) on delete restrict,                -- destino; obligatorio solo en salidas
  usuario_id  uuid references auth.users(id) on delete set null,                  -- quién registró; si se borra la cuenta, el kardex sobrevive
  motivo      text,
  fecha       timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  -- una salida SIEMPRE lleva área destino; una entrada NUNCA lleva área
  constraint movimientos_salida_area   check ( tipo <> 'salida'  or area_id is not null ),
  constraint movimientos_entrada_area  check ( tipo <> 'entrada' or area_id is null )
);

create index movimientos_producto_idx on public.movimientos (producto_id);
create index movimientos_fecha_idx    on public.movimientos (fecha desc);
```

- **`producto_id`** `on delete restrict`: como los productos se **soft-eliminan** (nunca borrado físico), el `restrict` es solo un cinturón de seguridad; el kardex siempre resuelve a una fila real.
- **`usuario_id`** `on delete set null`: el Spec 04 borra cuentas físicamente; si se elimina quien registró un movimiento, el movimiento **sobrevive** con `usuario_id = null` (se muestra "—"). Prevalece no perder el historial.
- **`area_id`** `on delete restrict`: reafirma la regla del Spec 04 (no se elimina un área referenciada); una salida siempre conserva su área destino.
- La `fecha` es `now()` por defecto y no se expone para edición.

### Función `registrar_movimiento` (RPC transaccional)

Único punto que muta `stock_actual`. Corre como el **invocador** (`security invoker`), así la RLS aplica con `auth.uid()` del admin y `usuario_id` sale de `auth.uid()`.

```sql
-- forma tentativa; se ajusta al implementar
create function public.registrar_movimiento(
  p_tipo        text,
  p_producto_id uuid,
  p_cantidad    int,
  p_area_id     uuid default null,
  p_motivo      text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock int;
  v_id    uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'no autorizado';
  end if;

  -- bloquea la fila para evitar carreras entre salidas concurrentes
  select stock_actual into v_stock
    from public.productos
   where id = p_producto_id and eliminado = false
   for update;

  if v_stock is null then
    raise exception 'producto inexistente o eliminado';
  end if;

  if p_tipo = 'salida' and p_cantidad > v_stock then
    raise exception 'stock insuficiente';   -- el stock nunca queda negativo
  end if;

  update public.productos
     set stock_actual = stock_actual + case when p_tipo = 'entrada' then p_cantidad else -p_cantidad end
   where id = p_producto_id;

  insert into public.movimientos (tipo, producto_id, cantidad, area_id, usuario_id, motivo)
  values (p_tipo, p_producto_id, p_cantidad,
          case when p_tipo = 'salida' then p_area_id else null end,
          auth.uid(), p_motivo)
  returning id into v_id;

  return v_id;
end;
$$;
```

- El `for update` serializa dos salidas simultáneas del mismo producto: la segunda espera y revalida el stock, evitando negativos por carrera.
- La validación de "salida exige área" / "entrada sin área" la garantizan los `check`s de la tabla y el `movimientoSchema` (zod); la función normaliza el `area_id` según el tipo.

### RLS de `movimientos`

```sql
alter table public.movimientos enable row level security;

-- LECTURA: solo admin/superadmin en este spec. El Spec 08 añadirá una política para el rol 'usuario' (su área).
create policy "movimientos_select" on public.movimientos for select
  to authenticated using ( (select public.is_admin()) );

-- INSERT: solo admin/superadmin (los inserts pasan por la RPC, que corre como invocador).
create policy "movimientos_insert" on public.movimientos for insert
  to authenticated with check ( (select public.is_admin()) );

-- Sin políticas de UPDATE ni DELETE: un movimiento es inmutable (no se edita ni se anula).
```

### Soft-delete de `productos` (`0014_productos_soft_delete.sql`)

```sql
alter table public.productos
  add column eliminado boolean not null default false;

-- el SKU deja de ser único global y pasa a ser único SOLO entre productos vigentes,
-- para poder reusar el SKU de un producto dado de baja.
alter table public.productos drop constraint productos_sku_key;   -- nombre real del unique del Spec 03 (a confirmar al aplicar)
create unique index productos_sku_vigente_idx on public.productos (sku) where eliminado = false;
```

- El borrado de producto desde la UI marca `eliminado = true`; **nunca** borra la fila ni la imagen en Storage.
- Toda lectura de catálogo (lista de productos, `select` del formulario de movimientos) filtra `eliminado = false`.
- **Comportamiento conocido:** la regla "no se puede eliminar una categoría con productos" (Spec 03, FK `restrict`) sigue contando los productos soft-eliminados; una categoría con productos dados de baja no será eliminable. Es aceptable (sus movimientos conservan la referencia).

### Esquemas zod (cliente + servidor) — `lib/movimientos/schemas.ts`

```ts
// forma tentativa; se ajusta al implementar
export const movimientoSchema = z.object({
  tipo:        z.enum(['entrada', 'salida']),
  producto_id: z.string().uuid(),
  cantidad:    z.number().int().positive(),
  area_id:     z.string().uuid().optional(),
  motivo:      z.string().optional(),
}).refine(v => v.tipo !== 'salida' || !!v.area_id, {
  message: 'Una salida necesita un área destino',
  path: ['area_id'],
}).refine(v => v.tipo !== 'entrada' || !v.area_id, {
  message: 'Una entrada no lleva área',
  path: ['area_id'],
})
```

---

## 4. Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir código de Supabase (RLS, **funciones/RPC**, `postgres`), Next 16 (Server Actions, `revalidatePath`, `searchParams`), `react-hook-form`/`zod` y shadcn.

1. **Migración `movimientos` + RPC + RLS.** Crear `supabase/migrations/0013_movimientos.sql` con la tabla `movimientos` (con sus `check`s e índices), las políticas `movimientos_select` / `movimientos_insert` (ambas `is_admin()`, sin update/delete) y la función `registrar_movimiento`. *Test:* aplicar la migración; llamar la RPC como admin registra una entrada y sube `stock_actual`; una salida mayor al stock devuelve "stock insuficiente"; una entrada con `area_id` o una salida sin `area_id` son rechazadas por los `check`.

2. **Migración soft-delete de productos.** Crear `supabase/migrations/0014_productos_soft_delete.sql`: columna `eliminado`, drop del `unique(sku)` y creación del índice único parcial `productos_sku_vigente_idx`. *Test:* aplicar; marcar un producto `eliminado = true` funciona; crear otro producto con el mismo SKU que uno eliminado funciona; dos productos vigentes con el mismo SKU se rechazan.

3. **Ajustar el catálogo al soft-delete.** En `app/admin/productos/`: `page.tsx` y cualquier query de catálogo filtran `eliminado = false`; `actions.ts` cambia `eliminar` para marcar `eliminado = true` (deja de borrar la fila y el objeto de Storage). *Test:* "eliminar" un producto lo saca de la lista pero conserva su fila; el producto ya no aparece en selects; su imagen sigue en Storage.

4. **Esquemas zod + constantes.** Crear `lib/movimientos/constants.ts` (etiquetas de tipo, p. ej. `{ entrada: 'Entrada', salida: 'Salida' }`) y `lib/movimientos/schemas.ts` (`movimientoSchema`). *Test:* unit tests Vitest (salida sin área falla; entrada con área falla; cantidad 0 o negativa falla; caso válido de entrada y de salida pasan).

5. **Server Action `registrar`.** Crear `app/admin/movimientos/actions.ts`: guard `is_admin()` en servidor, validación con `movimientoSchema`, `supabase.rpc('registrar_movimiento', {...})`, captura del error de "stock insuficiente" (y "producto eliminado") devolviéndolo como mensaje inline, y `revalidatePath('/admin/movimientos')` + `revalidatePath('/admin/productos')`. *Test:* registrar una entrada válida incrementa el stock; una salida válida lo decrementa; una salida mayor al stock devuelve el mensaje sin tocar el stock.

6. **Página de Movimientos + registro.** Crear `app/admin/movimientos/page.tsx` (server component que lee `movimientos` con join a producto/área/usuario y respeta `searchParams.producto`) y `app/admin/movimientos/movimientos-client.tsx` (tabla con filtro/orden en cliente por producto, tipo, área y fecha; `Dialog` de registro rhf + zod donde el campo **área** solo aparece y es requerido si el tipo es `salida`). Añadir el enlace **Movimientos** al sidebar (`app/admin/layout.tsx`). *Test:* un admin registra entradas y salidas desde el modal; la lista se filtra/ordena; un usuario que entra a `/admin/movimientos` es redirigido (guard del Spec 02).

7. **Enlace "Ver kardex" desde productos.** En `app/admin/productos/productos-client.tsx` añadir, por fila, un enlace a `/admin/movimientos?producto=<id>`. *Test:* desde un producto, "Ver kardex" abre la página filtrada por ese producto y lista solo sus movimientos en orden cronológico.

8. **Seed de movimientos.** Añadir a `supabase/seed.sql` ~10–15 movimientos (entradas y salidas sobre los productos/áreas sembrados, `usuario_id` = superadmin) insertados **directamente** (el seed corre como superusuario, sin `auth.uid()`, así que no usa la RPC) y **cuadrar** `productos.stock_actual` al neto de esos movimientos. *Test:* tras el seed existen ~10–15 movimientos y el `stock_actual` de cada producto afectado coincide con sus entradas menos sus salidas.

9. **Verificación integral.** `npm run lint` y `npm test`, más una pasada manual: registrar entrada/salida, ver el kardex por producto, intentar una salida sin stock, "eliminar" un producto con movimientos y confirmar que su historial sigue visible. *Test:* todos los criterios de aceptación se cumplen.

---

## 5. Criterios de aceptación

- [x] Registrar una **entrada** de N incrementa `stock_actual` en N.
- [x] Registrar una **salida** de N a un área decrementa `stock_actual` en N.
- [x] Una **salida mayor al stock** disponible es rechazada con mensaje claro y el stock **no** cambia (nunca queda negativo).
- [x] El ajuste de stock y el insert del movimiento ocurren en **una sola transacción** (función `registrar_movimiento`); no hay forma desde la app de cambiar `stock_actual` sin un movimiento.
- [x] Una **salida** exige **área destino** (zod + `check`); una **entrada** no lleva área (zod + `check`).
- [x] La `cantidad` debe ser **> 0** (zod + `check`).
- [x] El movimiento guarda **quién** lo registró (`usuario_id = auth.uid()`) y la **fecha** (`now()`), no editable.
- [x] Un movimiento **no** se puede editar ni anular desde la app (no hay políticas de update/delete sobre `movimientos`).
- [x] La página `/admin/movimientos` lista el historial y permite **filtrar/ordenar** por producto, tipo, área y fecha; un **usuario** que entra ahí es redirigido. *(implementado y compila; pendiente pasada manual)*
- [x] Desde un producto, **Ver kardex** abre `/admin/movimientos?producto=<id>` filtrada por ese producto, con sus movimientos en orden cronológico. *(implementado y compila; pendiente pasada manual)*
- [x] **Eliminar** un producto lo saca del catálogo (soft-delete: `eliminado = true`) pero **conserva** su fila y **todo su historial** de movimientos sigue visible en el kardex. *(el soft-delete y la persistencia del historial están verificados en BD; pendiente ejecutar el borrado desde la UI)*
- [x] Se puede **reusar el SKU** de un producto eliminado al crear otro producto; dos productos **vigentes** no pueden compartir SKU.
- [x] No se puede registrar un movimiento sobre un producto **eliminado** (la RPC lo rechaza y el `select` del formulario no lo ofrece).
- [x] Un usuario **no admin**, vía RLS, no puede leer ni insertar en `movimientos`.
- [x] El **seed** carga ~10–15 movimientos y el `stock_actual` de cada producto cuadra con el neto de sus movimientos.
- [x] `movimientoSchema` tiene **tests unitarios** (Vitest) con casos válidos e inválidos.
- [x] El sidebar del shell admin muestra el enlace **Movimientos**.

---

## 6. Decisiones

- **Sí:** **función Postgres `registrar_movimiento`** (RPC, `security invoker`) que hace insert + ajuste de stock en una transacción con `for update`. Es la única forma de garantizar atomicidad real y stock no-negativo bajo concurrencia; dos queries sueltas desde la Server Action no lo garantizan.
- **No:** ajustar el stock con dos queries separadas (`insert` + `update`) en la Server Action. Si la segunda falla, el stock queda inconsistente.
- **Sí:** **`security invoker`** en la RPC para que la RLS aplique con la sesión del admin y `usuario_id` salga de `auth.uid()`. `security definer` obligaría a re-verificar permisos a mano y perdería el `auth.uid()` del actor.
- **Sí:** **soft-delete de productos** (`eliminado boolean`) como respuesta a "se eliminan productos pero el historial no se pierde". La fila persiste, los movimientos siguen apuntando a un producto real y los agregados del Spec 07 quedan sin huecos.
- **No:** `on delete restrict` en `movimientos.producto_id` como mecanismo de borrado (bloquearía eliminar productos con historial) ni `on delete cascade` (borraría el historial). El `restrict` queda solo como cinturón de seguridad, porque los productos ya no se borran físicamente.
- **No:** **snapshot denormalizado** (copiar nombre/SKU del producto en cada movimiento) con borrado físico. Duplica datos y complica la agregación del dashboard (agrupar por `producto_id` que podría ser `null`); el soft-delete mantiene una identidad de producto estable.
- **Sí:** **SKU único solo entre productos vigentes** (índice único parcial `where eliminado = false`). Permite reusar el SKU de un producto dado de baja sin chocar con su fila histórica.
- **Sí:** `usuario_id` con **`on delete set null`**: si el Spec 04 borra la cuenta que registró un movimiento, el kardex sobrevive (muestra "—"). Prevalece no perder el historial sobre saber siempre el autor.
- **Sí:** **`fecha` = `now()`** fija, no editable. Fiel al momento real del registro; sin la complejidad (y el riesgo de auditoría) de retro-fechar.
- **Sí:** **`motivo` opcional** en entradas y salidas. Texto libre; útil sin ser obligatorio.
- **Sí:** movimiento **inmutable** — sin editar ni anular en este spec (RLS sin update/delete). La reversa como movimiento inverso se decide a futuro; evita re-abrir el ajuste de stock.
- **Sí:** **una página `/admin/movimientos`** con lista global + `Dialog` de registro, y **kardex por producto** como esa misma lista pre-filtrada por `searchParams.producto`. Consistente con el patrón modal + filtro-en-cliente de los Specs 03/04; una sola superficie que sirve al historial global y al de un producto.
- **No:** página dedicada `/admin/productos/[id]/kardex`. Más rutas y archivos para lo que un filtro resuelve.
- **Sí:** **RLS de `select` restringida a `is_admin()`** ahora; el Spec 08 añade la política del rol `usuario` (su área). Mínimo privilegio: no abrir todo el historial a los usuarios antes de tiempo.
- **Sí:** **seed con inserts directos** a `movimientos` (no vía la RPC, que exige `auth.uid()`), **cuadrando** `stock_actual`. El seed corre como superusuario sin sesión; usar la RPC fallaría por `is_admin()`.
- **Sí:** **stock inicial existente sin migración retroactiva** (decisión 3.a): `stock_actual` de los productos ya creados se respeta como está; de aquí en adelante todo cambio pasa por un movimiento. No se generan "entradas iniciales" para el pasado.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Dos salidas concurrentes del mismo producto dejan el stock negativo (condición de carrera). | La RPC bloquea la fila con `select … for update` y revalida el stock dentro de la transacción; la segunda salida espera y es rechazada si ya no alcanza. |
| El stock se cambia por fuera del kardex (update directo a `productos.stock_actual`), rompiendo la regla de oro. | El único camino de escritura de stock desde la app es la RPC; la RLS de `productos` (Spec 03, `is_admin()`) sigue permitiendo updates de admin, así que la disciplina se documenta y el flujo de UI no expone edición directa de stock. |
| Al hacer soft-delete queda catálogo mostrando productos eliminados. | Toda lectura de catálogo (lista, selects) filtra `eliminado = false`; se revisa en el paso 3 del plan. |
| El `unique(sku)` global impediría reusar el SKU de un producto eliminado. | Se reemplaza por un índice único parcial `where eliminado = false`. |
| Borrar un usuario (Spec 04) arrastraría o dejaría huérfanos sus movimientos. | `usuario_id on delete set null`: el movimiento sobrevive con autor "—"; el historial no se pierde ni bloquea el borrado de la cuenta. |
| El error crudo de "stock insuficiente" de la RPC llega sin formato al usuario. | La Server Action captura la excepción de la función y devuelve un mensaje inline en el formulario. |
| El seed que inserta movimientos directos deja `stock_actual` descuadrado respecto a las entradas/salidas sembradas. | El seed fija `stock_actual` al neto calculado de los movimientos que siembra; un criterio de aceptación lo verifica. |
| La categoría con solo productos soft-eliminados no se puede borrar (FK `restrict` los cuenta). | Documentado como comportamiento conocido y aceptable; los movimientos de esos productos conservan su referencia. |

---

## 8. Lo que **no** entra en este spec

- El **vale de salida en PDF** (→ Spec 06).
- El **dashboard** de más/menos pedidos, próximos a caducar y stock bajo (→ Spec 07).
- La **vista del usuario** (historial en solo lectura de su área) y su política RLS de `select` (→ Spec 08).
- **Editar, anular o revertir** un movimiento; **retro-fechar** movimientos.
- **Lotes múltiples** por producto y control de caducidad por entrada.
- **Restaurar** un producto soft-eliminado desde la UI.

Cada uno, cuando llegue, va en su propio spec.
