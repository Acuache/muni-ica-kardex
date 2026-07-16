-- SPEC 06.1 · Paso 2 — Función `registrar_movimientos_lote`.
--
-- Registra varios productos (de cualquier categoría) en un mismo lote, en UNA
-- transacción. No toca `stock_actual` ni inserta por su cuenta: delega en
-- `registrar_movimiento` (Spec 05), que sigue siendo el único camino de
-- escritura de stock, con su bloqueo de fila y su chequeo. Así el corazón
-- transaccional del Spec 05 queda literal.
--
-- Todo-o-nada GRATIS: una función plpgsql corre dentro de la transacción de
-- quien la llama. Si un item lanza "stock insuficiente", el `raise` aborta la
-- transacción y los inserts previos del lote se van con ella.
create function public.registrar_movimientos_lote(
  p_tipo    text,
  p_items   jsonb,                  -- [{"producto_id":"…","cantidad":3}, …] de cualquier categoría
  p_area_id uuid default null,
  p_motivo  text default null
) returns uuid                      -- id de un movimiento del lote (el primero insertado)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lote    uuid := gen_random_uuid();
  v_item    record;
  v_id      uuid;
  v_primero uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'lote vacío';
  end if;

  -- Recorre ORDENADO por producto_id: dos lotes concurrentes con productos en
  -- común bloquean en el mismo orden, así uno espera al otro en vez de trenzarse
  -- en un deadlock. El guard is_admin() y el chequeo de stock los aplica cada
  -- llamada a registrar_movimiento.
  for v_item in
    select (e->>'producto_id')::uuid as producto_id,
           (e->>'cantidad')::int     as cantidad
      from jsonb_array_elements(p_items) e
     order by producto_id
  loop
    v_id := public.registrar_movimiento(
      p_tipo, v_item.producto_id, v_item.cantidad, p_area_id, p_motivo, v_lote
    );
    if v_primero is null then
      v_primero := v_id;
    end if;
  end loop;

  return v_primero;
end;
$$;

comment on function public.registrar_movimientos_lote is
  'Registra un lote multiproducto (Spec 06.1) en una transacción, delegando cada item en registrar_movimiento. Todo-o-nada: si un item falla, el lote entero se revierte. Recorre por producto_id para evitar deadlocks entre lotes concurrentes.';
