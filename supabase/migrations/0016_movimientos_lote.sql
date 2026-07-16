-- SPEC 06.1 · Paso 1 — Columna `lote_id` y nueva firma de `registrar_movimiento`.
--
-- Un registro puede llevar varios productos (de cualquier categoría) en una
-- sola entrada o salida. Cada producto sigue siendo su propia fila del kardex
-- (Spec 05, intacto); lo que se añade es una etiqueta `lote_id` que agrupa las
-- filas registradas juntas, para reconstruir el vale consolidado (Spec 06.1).
--
-- La categoría NO se guarda aquí: se deriva de `productos.categoria_id` al leer.

-- ---------------------------------------------------------------------------
-- Columna `lote_id`
-- ---------------------------------------------------------------------------
-- Nullable y sin FK: es solo una etiqueta de agrupación (no hay tabla `lotes`;
-- tipo/area/motivo/fecha ya se repiten en cada fila del lote). Las filas que ya
-- existen (seed y movimientos de los Specs 05/06) quedan en null = lote de una.
alter table public.movimientos add column lote_id uuid;

comment on column public.movimientos.lote_id is
  'Agrupa las filas registradas en un mismo movimiento multiproducto (Spec 06.1). null = movimiento suelto. Sin FK: etiqueta de agrupación, no entidad.';

-- Índice parcial: solo indexa las filas que pertenecen a un lote (las demás son
-- null y no se consultan por lote).
create index movimientos_lote_idx on public.movimientos (lote_id) where lote_id is not null;

-- ---------------------------------------------------------------------------
-- `registrar_movimiento` gana `p_lote_id`
-- ---------------------------------------------------------------------------
-- OJO: un `create or replace` con un parámetro de más NO reemplaza — crea una
-- SOBRECARGA, y la llamada de 5 argumentos quedaría ambigua ("function is not
-- unique"). Por eso se dropea la versión de 5 argumentos y se recrea con 6.
--
-- El cuerpo es idéntico al del Spec 05 (mismo is_admin, mismo `for update`,
-- mismo rechazo de stock insuficiente y producto eliminado): sigue siendo el
-- ÚNICO camino que muta `stock_actual`. Lo único que cambia es el `insert`, que
-- ahora nombra también `lote_id` (null en un movimiento suelto).
drop function public.registrar_movimiento(text, uuid, int, uuid, text);

create function public.registrar_movimiento(
  p_tipo        text,
  p_producto_id uuid,
  p_cantidad    int,
  p_area_id     uuid default null,
  p_motivo      text default null,
  p_lote_id     uuid default null
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

  insert into public.movimientos (tipo, producto_id, cantidad, area_id, usuario_id, motivo, lote_id)
  values (
    p_tipo,
    p_producto_id,
    p_cantidad,
    case when p_tipo = 'salida' then p_area_id else null end,  -- normaliza el área según el tipo
    (select auth.uid()),
    p_motivo,
    p_lote_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.registrar_movimiento is
  'Único camino que muta productos.stock_actual (Spec 05). Atómico: bloquea la fila (for update), valida stock y registra el movimiento en una transacción. p_lote_id (Spec 06.1) etiqueta la fila con su lote; null = movimiento suelto.';
