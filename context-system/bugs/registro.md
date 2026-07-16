# Registro de bugs

> Registro real de bugs no triviales de este proyecto. El criterio, las convenciones y la **plantilla de entrada** están en [`descripcion.md`](descripcion.md).

## Índice

| ID | Título | Estado | Fecha |
|----|--------|--------|-------|
| [BUG-001](#bug-001--select-de-base-ui-muestra-el-value-uuid-en-vez-del-label-nombre) | Select de Base UI muestra el `value` (uuid) en vez del `label` (nombre) | 🟢 Resuelto | 2026-07-14 |
| [BUG-002](#bug-002--el-backfill-de-lotes-ignora-los-movimientos-con-lote_id-preexistente-y-la-fk-not-null-falla) | El backfill de `lotes` ignora los movimientos con `lote_id` preexistente y la FK not null falla | 🟢 Resuelto | 2026-07-16 |

## Entradas

<!-- Añade cada bug real debajo, copiando la plantilla de `descripcion.md`. -->

### BUG-001 — Select de Base UI muestra el `value` (uuid) en vez del `label` (nombre)

- **Estado:** 🟢 Resuelto
- **Fecha:** 2026-07-14
- **Severidad:** Media

**Síntoma.** En "Editar producto" (`/admin/productos`), al abrir el diálogo o elegir una categoría, el selector mostraba en el trigger el **uuid** de la categoría en lugar de su **nombre**. Se notaba sobre todo en edición porque `categoria_id` viene precargado con el uuid.

**Causa raíz.** El componente `Select` de shadcn en este proyecto está construido sobre **Base UI** (`@base-ui/react/select`), no sobre Radix. `Select.Value` de Base UI renderiza por defecto el **valor** seleccionado tal cual; para mostrar una etiqueta distinta del valor necesita el mapeo `value → label` vía la prop **`items`** en `Select.Root` (o una función `render` en `Select.Value`). Sin `items`, cuando el valor (uuid) difiere del texto visible (nombre), se pinta el uuid. En el select de "unidad" no se notaba porque valor y etiqueta eran idénticos.

**Investigación.** Se revisó `components/ui/select.tsx` (wrapper: `Select = SelectPrimitive.Root`) y la doc de Base UI Select (context7): confirma que `Select.Value` usa `items` para resolver la etiqueta del valor actual antes de abrir el popup.

**Solución.** Pasar `items` al `Select` de categoría con el mapeo de las categorías:
`items={categorias.map((c) => ({ value: c.id, label: c.nombre }))}`.

**Archivos afectados.**
- `app/admin/productos/productos-client.tsx` (select de categoría del formulario; también el filtro por categoría usa `items`).

**Prevención / lección.** En Base UI, **cualquier `Select` cuyo `value` ≠ texto mostrado necesita la prop `items`** con `{ value, label }[]`. Regla a seguir para todos los selects de la app (categorías, áreas, etc. en specs futuros).

**Referencia.** Rama `spec-03-catalogo-categorias-productos`.

### BUG-002 — El backfill de `lotes` ignora los movimientos con `lote_id` preexistente y la FK not null falla

- **Estado:** 🟢 Resuelto
- **Fecha:** 2026-07-16
- **Severidad:** Media

**Síntoma.** Al aplicar la migración `0018_lotes.sql` (Spec 06.1, ampliación de lotes), la migración abortó y revirtió con:
`ERROR: 23503: insert or update on table "movimientos" violates foreign key constraint "movimientos_lote_id_fkey" — Key (lote_id)=(d466…) is not present in table "lotes".`

**Causa raíz.** El backfill inicial creaba un lote solo por cada movimiento `where lote_id is null`. Pero en la BD ya existían movimientos con `lote_id` **no null** — dos lotes reales registrados desde la UI durante una pasada visual previa (Spec 06.1 base). Como la migración crea la tabla `lotes` **vacía** y luego añade la FK `not null`, esos `lote_id` viejos apuntaban a filas inexistentes y la FK los rechazó. Suposición equivocada: «los únicos movimientos sin lote son los `null`».

**Investigación.** La migración es transaccional, así que revirtió por completo (la tabla `lotes` no llegó a existir). Con `execute_sql` (MCP Supabase) se consultó el estado real: 22 movimientos = 14 con `lote_id null` (seed) + 8 con `lote_id` no null repartidos en **2 lotes distintos**. Eso reveló los datos de prueba que el backfill no contemplaba.

**Solución.** Backfill robusto que recorre **todos** los movimientos en orden cronológico con un mapa `viejo→nuevo` (jsonb): los que ya comparten un `lote_id` se reagrupan en un mismo lote nuevo; los `null` reciben uno cada uno. Así toda fila queda con un `lote_id` válido antes del `set not null` + FK.

**Archivos afectados.**
- `supabase/migrations/0018_lotes.sql` (bloque `do $$ … $$` del backfill).

**Prevención / lección.** Un backfill que va a imponer una **FK `not null`** debe cubrir **todas** las filas de la columna, no solo las `null`; si pueden existir filas cuya FK apunta a valores que se recrean, hay que reagruparlas por su valor actual. Y antes de asumir el estado de los datos, **verificar en la BD** (puede haber filas de pruebas visuales previas), no fiarse del "debería haber solo N del seed".

**Referencia.** Rama `spec-06.1-movimientos-multiproducto`.
