-- SPEC 03 · Ajuste — se elimina la columna `unidad` de `productos`.
--
-- El campo de unidad de medida se retiró del catálogo a pedido. Al eliminar la
-- columna se descarta también su check de lista cerrada. Cambio de esquema
-- seguro: los datos actuales son ficticios (seed).

alter table public.productos drop column unidad;
