# Registro de bugs

> Registro real de bugs no triviales de este proyecto. El criterio, las convenciones y la **plantilla de entrada** están en [`descripcion.md`](descripcion.md).

## Índice

| ID | Título | Estado | Fecha |
|----|--------|--------|-------|
| [BUG-001](#bug-001--select-de-base-ui-muestra-el-value-uuid-en-vez-del-label-nombre) | Select de Base UI muestra el `value` (uuid) en vez del `label` (nombre) | 🟢 Resuelto | 2026-07-14 |

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
