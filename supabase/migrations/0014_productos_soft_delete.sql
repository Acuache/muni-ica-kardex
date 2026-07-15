-- SPEC 05 · Paso 2 — Soft-delete de productos.
--
-- Cierra la deuda del Spec 03: cómo borrar un producto sin perder su historial.
-- El borrado pasa a ser LÓGICO (marca `eliminado = true`), nunca físico, para
-- que los movimientos sigan apuntando a un producto real y el kardex (y el
-- dashboard del Spec 07) nunca queden con huecos. El SKU único deja de ser
-- global y pasa a ser único SOLO entre productos vigentes, para poder reusar el
-- SKU de un producto dado de baja.

alter table public.productos
  add column eliminado boolean not null default false;

comment on column public.productos.eliminado is
  'Soft-delete (Spec 05): true = dado de baja. Toda lectura de catálogo filtra eliminado = false; el borrado desde la UI marca este flag, nunca borra la fila.';

-- El SKU deja de ser único global y pasa a ser único SOLO entre productos
-- vigentes, para poder reusar el SKU de un producto eliminado.
alter table public.productos drop constraint productos_sku_key;

create unique index productos_sku_vigente_idx
  on public.productos (sku)
  where eliminado = false;
