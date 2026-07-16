-- SPEC 06.1 (ampliación) · Lotes como entidad con correlativo legible.
--
-- El 06.1 dejó `movimientos.lote_id` como una etiqueta uuid sin entidad. Aquí el
-- lote se vuelve una fila de `public.lotes` con un correlativo global `numero`
-- (que la UI muestra como `L-000001`). La tabla es MÍNIMA: solo genera el número
-- y ancla la FK; tipo/área/motivo/fecha/autor se siguen derivando de los
-- movimientos del lote, que ya los repiten.

-- ---------------------------------------------------------------------------
-- Tabla `lotes`
-- ---------------------------------------------------------------------------
create table public.lotes (
  id         uuid primary key default gen_random_uuid(),
  numero     bigint generated always as identity,   -- correlativo global → L-000001
  created_at timestamptz not null default now(),
  constraint lotes_numero_key unique (numero)
);

comment on table public.lotes is
  'Agrupa los movimientos registrados juntos (Spec 06.1). `numero` es el correlativo global que la UI muestra como L-000001. Inmutable (sin update/delete).';

-- RLS: igual que movimientos — solo admin/superadmin lee e inserta (los inserts
-- pasan por la RPC, que corre como invocador). Sin update/delete: inmutable.
alter table public.lotes enable row level security;

create policy "lotes_select" on public.lotes for select
  to authenticated
  using ( (select public.is_admin()) );

create policy "lotes_insert" on public.lotes for insert
  to authenticated
  with check ( (select public.is_admin()) );

-- ---------------------------------------------------------------------------
-- Backfill de históricos, en orden cronológico. El `numero` identity sale 1..N
-- por orden de inserción, así que recorrer por fecha deja el lote más antiguo
-- con el número más bajo. Se recorre TODO movimiento: los que ya comparten un
-- `lote_id` (lotes reales previos a esta migración) se reagrupan en un mismo
-- lote nuevo (mapa viejo→nuevo); los sueltos (`lote_id` null) reciben uno cada
-- uno.
-- ---------------------------------------------------------------------------
do $$
declare
  r      record;
  v_lote uuid;
  v_map  jsonb := '{}'::jsonb;   -- lote_id viejo (text) → lote nuevo (uuid text)
begin
  for r in
    select id, lote_id from public.movimientos
     order by fecha, created_at, id
  loop
    if r.lote_id is not null and (v_map ? (r.lote_id::text)) then
      v_lote := (v_map->>(r.lote_id::text))::uuid;   -- grupo ya visto: reusa su lote
    else
      insert into public.lotes default values returning id into v_lote;
      if r.lote_id is not null then
        v_map := v_map || jsonb_build_object(r.lote_id::text, v_lote::text);
      end if;
    end if;
    update public.movimientos set lote_id = v_lote where id = r.id;
  end loop;
end $$;

-- Ahora todo movimiento tiene lote: se cierra la columna (not null + FK).
alter table public.movimientos
  alter column lote_id set not null,
  add constraint movimientos_lote_id_fkey
    foreign key (lote_id) references public.lotes(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- `registrar_movimientos_lote` ahora crea la fila de `lotes` (obtiene id +
-- número) en vez de generar un uuid suelto. Misma firma, así que basta un
-- `create or replace`. El resto (loop, delega en registrar_movimiento,
-- todo-o-nada) no cambia.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_movimientos_lote(
  p_tipo    text,
  p_items   jsonb,
  p_area_id uuid default null,
  p_motivo  text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lote    uuid;
  v_item    record;
  v_id      uuid;
  v_primero uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'lote vacío';
  end if;

  -- Crea el lote: la fila de `lotes` asigna el número correlativo.
  insert into public.lotes default values returning id into v_lote;

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
  'Registra un lote multiproducto (Spec 06.1) en una transacción: crea la fila de lotes (correlativo) y delega cada item en registrar_movimiento. Todo-o-nada: si un item falla, el lote entero se revierte.';
