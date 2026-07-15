-- SPEC 05 · Paso 1 — Tabla `movimientos`, su RLS y la función transaccional
-- `registrar_movimiento`.
--
-- Es el corazón del kardex: desde este spec `productos.stock_actual` solo
-- cambia por un movimiento, y ese cambio es ATÓMICO — insertar el movimiento y
-- ajustar el stock ocurren juntos o no ocurren. Por eso el ajuste vive en una
-- función Postgres transaccional con bloqueo de fila (`for update`), no en dos
-- queries sueltas desde la Server Action. Reusa `is_admin()` del Spec 02.

-- ---------------------------------------------------------------------------
-- Tabla `movimientos`
-- ---------------------------------------------------------------------------
create table public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('entrada','salida')),
  producto_id uuid not null
                references public.productos(id) on delete restrict,  -- backstop: los productos se soft-eliminan, nunca se borran físicamente
  cantidad    int  not null check (cantidad > 0),
  area_id     uuid references public.areas(id) on delete restrict,    -- destino; obligatorio solo en salidas
  usuario_id  uuid references auth.users(id) on delete set null,      -- quién registró; si se borra la cuenta, el kardex sobrevive
  motivo      text,
  fecha       timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  -- una salida SIEMPRE lleva área destino; una entrada NUNCA lleva área
  constraint movimientos_salida_area  check ( tipo <> 'salida'  or area_id is not null ),
  constraint movimientos_entrada_area check ( tipo <> 'entrada' or area_id is null )
);

create index movimientos_producto_idx on public.movimientos (producto_id);
create index movimientos_fecha_idx    on public.movimientos (fecha desc);

comment on table public.movimientos is
  'Kardex imborrable (Spec 05): entradas/salidas que mueven el stock. Inmutable (sin update/delete).';
comment on column public.movimientos.producto_id is
  'on delete restrict: cinturón de seguridad; los productos se soft-eliminan, así que el kardex siempre resuelve a una fila real.';
comment on column public.movimientos.area_id is
  'Área destino; obligatoria solo en salidas (constraint movimientos_salida_area). on delete restrict.';
comment on column public.movimientos.usuario_id is
  'Quién registró (auth.uid()). on delete set null: si se borra la cuenta (Spec 04), el movimiento sobrevive con autor "—".';
comment on column public.movimientos.fecha is
  'Momento real del registro; siempre now(), no editable.';

-- ---------------------------------------------------------------------------
-- RLS de `movimientos`
-- ---------------------------------------------------------------------------
-- LECTURA: solo admin/superadmin en este spec (el Spec 08 añadirá la política
-- del rol 'usuario' para su área). INSERT: solo admin/superadmin (los inserts
-- pasan por la RPC, que corre como invocador). Sin UPDATE ni DELETE: un
-- movimiento es inmutable. is_admin() envuelto en (select ...) para que el
-- optimizador lo cachee por sentencia (initPlan), como en 0002/0009/0012.
alter table public.movimientos enable row level security;

create policy "movimientos_select" on public.movimientos for select
  to authenticated
  using ( (select public.is_admin()) );

create policy "movimientos_insert" on public.movimientos for insert
  to authenticated
  with check ( (select public.is_admin()) );

-- ---------------------------------------------------------------------------
-- Función transaccional `registrar_movimiento` (RPC)
-- ---------------------------------------------------------------------------
-- Único punto que muta `stock_actual`. Corre como el INVOCADOR (`security
-- invoker`, el default recomendado por Supabase), así la RLS aplica con la
-- sesión del admin y `usuario_id` sale de `auth.uid()`. `search_path = ''` +
-- todo calificado por esquema, para blindar la resolución de nombres.
--
-- En una sola transacción: valida permiso, bloquea la fila del producto
-- (`for update`), rechaza salidas mayores al stock y productos eliminados,
-- ajusta el stock (entrada suma, salida resta) e inserta el movimiento.
create function public.registrar_movimiento(
  p_tipo        text,
  p_producto_id uuid,
  p_cantidad    int,
  p_area_id     uuid default null,
  p_motivo      text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stock int;
  v_id    uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'no autorizado';
  end if;

  if p_tipo not in ('entrada','salida') then
    raise exception 'tipo inválido';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad inválida';
  end if;

  -- Bloquea la fila del producto para serializar salidas concurrentes: la
  -- segunda salida espera y revalida el stock, evitando negativos por carrera.
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
     set stock_actual = stock_actual
       + case when p_tipo = 'entrada' then p_cantidad else -p_cantidad end
   where id = p_producto_id;

  insert into public.movimientos (tipo, producto_id, cantidad, area_id, usuario_id, motivo)
  values (
    p_tipo,
    p_producto_id,
    p_cantidad,
    case when p_tipo = 'salida' then p_area_id else null end,  -- normaliza el área según el tipo
    (select auth.uid()),
    p_motivo
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.registrar_movimiento is
  'Único camino que muta productos.stock_actual (Spec 05). Atómico: bloquea la fila (for update), valida stock y registra el movimiento en una transacción.';
