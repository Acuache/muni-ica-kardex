-- SPEC 02 · Paso 2 — RLS de `profiles`.
--
-- Reglas:
--   · Lectura: cada quien lee su propia fila; admin/superadmin leen todas.
--   · Update propio: el dueño de la fila puede escribirla (los cambios de
--     role/area_id de un no-admin los bloquea el trigger del paso 3).
--   · Update de gestión: admin/superadmin pueden escribir cualquier fila.

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Helper: ¿el que llama es admin o superadmin?
-- ---------------------------------------------------------------------------
-- security definer + search_path='' rompe la recursión: la función consulta
-- public.profiles saltándose la RLS de la propia tabla, así que evaluar
-- is_admin() dentro de una policy de profiles no vuelve a disparar la policy.
create function public.is_admin()
returns boolean
language sql
security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'superadmin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- LECTURA: cada quien su fila; admin/superadmin, todas.
-- auth.uid() e is_admin() van envueltos en (select ...) para que el optimizador
-- cachee el resultado por sentencia (initPlan) en vez de reevaluarlo por fila.
create policy "profiles_select" on public.profiles for select
  using ( id = (select auth.uid()) or (select public.is_admin()) );

-- UPDATE propio: solo la propia fila. El paso 3 impide que un no-admin cambie
-- aquí su role o area_id, aunque la fila sea suya.
create policy "profiles_update_own" on public.profiles for update
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- UPDATE de gestión (rol/área de otros): solo admin/superadmin.
create policy "profiles_update_admin" on public.profiles for update
  using ( (select public.is_admin()) );
