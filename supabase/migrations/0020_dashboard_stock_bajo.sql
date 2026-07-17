-- SPEC 07 · Paso 7 — Función `dashboard_stock_bajo()` (lista de stock bajo).
--
-- La lista de stock bajo compara DOS columnas del mismo producto
-- (`stock_actual <= stock_minimo`), y el builder de supabase-js/PostgREST solo
-- filtra columna-vs-valor, no columna-vs-columna (confirmado con context7 al
-- implementar). En vez de traer todo el catálogo a Next para filtrarlo en JS, se
-- resuelve con esta función trivial `security invoker` (como el resto del
-- dashboard): `productos` ya es legible por admin (RLS del Spec 03) y la función
-- no la relaja. Sin parámetros: es estado ACTUAL del inventario, no depende del
-- rango. Ordena los agotados (`stock_actual = 0`) primero, luego por nombre.
create function public.dashboard_stock_bajo()
returns table (
  producto_id      uuid,
  sku              text,
  nombre           text,
  categoria_nombre text,
  stock_actual     int,
  stock_minimo     int
)
language sql
security invoker
set search_path = public
as $$
  select p.id, p.sku, p.nombre, c.nombre as categoria_nombre,
         p.stock_actual, p.stock_minimo
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
   where p.eliminado = false
     and p.stock_actual <= p.stock_minimo
   order by (p.stock_actual = 0) desc, p.nombre;
$$;

comment on function public.dashboard_stock_bajo is
  'SPEC 07: productos activos con stock_actual <= stock_minimo (lista "Stock bajo"), agotados primero. Resuelve el filtro columna-vs-columna que PostgREST no expresa. security invoker.';
