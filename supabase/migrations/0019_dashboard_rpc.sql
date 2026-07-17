-- SPEC 07 · Paso 1 — Funciones de agregación del dashboard del admin.
--
-- Este spec NO crea tablas ni columnas: solo LEE el kardex ya capturado (Specs
-- 03/05) y lo agrega. Sumar salidas por producto no se hace trayendo todas las
-- filas a Next y agrupando en JS: se hace en Postgres, con funciones RPC
-- `security invoker` que respetan la misma RLS `is_admin()` de `movimientos`
-- (Spec 05) y devuelven pocas filas ya masticadas. El servidor de Next solo
-- pinta. Las listas de estado (caducidad, stock bajo) van como `select` directos
-- sobre `productos` en el Server Component (no necesitan función).

-- ---------------------------------------------------------------------------
-- dashboard_pedidos(p_dias) — ranking de pedidos (ambos sentidos)
-- ---------------------------------------------------------------------------
-- Una fila por producto ACTIVO con >=1 salida en los últimos p_dias días, con la
-- suma de unidades salidas. De aquí salen los DOS rankings: más pedidos = las
-- primeras filas; menos pedidos = las últimas (misma consulta, invertida en JS).
-- security invoker: la RLS de movimientos (is_admin, Spec 05) filtra el scan, así
-- que un no-admin recibe cero filas y el ranking sale vacío.
create function public.dashboard_pedidos(p_dias int)
returns table (
  producto_id      uuid,
  sku              text,
  nombre           text,
  categoria_nombre text,
  total_unidades   bigint
)
language sql
security invoker
set search_path = public
as $$
  select p.id, p.sku, p.nombre, c.nombre as categoria_nombre,
         sum(m.cantidad)::bigint as total_unidades
    from public.movimientos m
    join public.productos  p on p.id = m.producto_id
    left join public.categorias c on c.id = p.categoria_id
   where m.tipo = 'salida'
     and p.eliminado = false
     and m.fecha >= now() - make_interval(days => p_dias)
   group by p.id, p.sku, p.nombre, c.nombre
   order by total_unidades desc, p.nombre;
$$;

comment on function public.dashboard_pedidos is
  'SPEC 07: ranking de pedidos (suma de unidades salidas) por producto activo con >=1 salida en p_dias días. security invoker: respeta la RLS is_admin() de movimientos.';

-- ---------------------------------------------------------------------------
-- dashboard_sin_movimiento(p_dias) — productos activos sin salidas en el rango
-- ---------------------------------------------------------------------------
-- Alimenta la lista "Sin movimiento": productos ACTIVOS con 0 salidas en los
-- últimos p_dias días. Un producto que nadie pidió no es "poco pedido" (no entra
-- al ranking de menos pedidos): es "no pedido" y va aquí.
create function public.dashboard_sin_movimiento(p_dias int)
returns table (
  producto_id      uuid,
  sku              text,
  nombre           text,
  categoria_nombre text,
  stock_actual     int
)
language sql
security invoker
set search_path = public
as $$
  select p.id, p.sku, p.nombre, c.nombre as categoria_nombre, p.stock_actual
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
   where p.eliminado = false
     and not exists (
       select 1 from public.movimientos m
        where m.producto_id = p.id
          and m.tipo = 'salida'
          and m.fecha >= now() - make_interval(days => p_dias)
     )
   order by p.nombre;
$$;

comment on function public.dashboard_sin_movimiento is
  'SPEC 07: productos activos SIN ninguna salida en p_dias días (lista "Sin movimiento"). security invoker: la RLS de movimientos aplica al not exists.';
