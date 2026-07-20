-- SPEC 08 · Paso 1 — RLS de lectura para el rol `usuario`: su historial de
-- entregas.
--
-- Hasta este spec, `movimientos_select` y `lotes_select` (Spec 05 / 06.1) solo
-- dejan leer a `is_admin()`; un `usuario` no lee ninguna fila. Este paso añade
-- el helper `mi_area_id()` (espejo de `is_admin()`, Spec 02 / `0002`) y dos
-- políticas SELECT permisivas que se SUMAN a las del admin (Postgres las
-- combina con OR): el usuario lee solo las salidas de su área.

-- ---------------------------------------------------------------------------
-- Helper: área del perfil que llama.
-- ---------------------------------------------------------------------------
-- security definer + search_path = '' para leer public.profiles sin exponer
-- la tabla ni depender del search_path del invocador — mismo endurecimiento
-- que is_admin() (Spec 02 / migración 0004). stable porque no muta. Devuelve
-- null si el perfil no tiene área o no hay sesión: sin área, ninguna fila.
create function public.mi_area_id()
returns uuid
language sql
security definer stable set search_path = ''
as $$
  select area_id from public.profiles where id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- LECTURA para el rol usuario: las salidas entregadas a SU área. Permisiva:
-- se suma a movimientos_select (is_admin, Spec 05) sin reemplazarla, así el
-- admin conserva la lectura total. Como solo las salidas llevan area_id (las
-- entradas lo tienen null por el check de 0013), esta política ya excluye las
-- entradas sin lógica extra; un usuario sin área (area_id null) no ve nada,
-- porque area_id = null nunca iguala. mi_area_id() envuelto en (select ...)
-- para que el optimizador lo cachee por sentencia (initPlan), como en
-- 0002/0009/0012/0013.
create policy "movimientos_select_usuario" on public.movimientos for select
  to authenticated
  using ( area_id is not null and area_id = (select public.mi_area_id()) );

-- LECTURA de lotes para el rol usuario: un lote es visible si contiene al
-- menos un movimiento de su área. Necesaria para mostrar el correlativo
-- L-000001 (vive en lotes, no en movimientos). Permisiva: se suma a
-- lotes_select (is_admin, Spec 06.1 / 0018).
create policy "lotes_select_usuario" on public.lotes for select
  to authenticated
  using ( exists (
    select 1 from public.movimientos m
    where m.lote_id = lotes.id
      and m.area_id = (select public.mi_area_id())
  ) );

comment on function public.mi_area_id() is
  'Área del perfil del auth.uid() (Spec 08), o null si no tiene área / no hay sesión. security definer + search_path = '''', espejo de is_admin() (0002).';
