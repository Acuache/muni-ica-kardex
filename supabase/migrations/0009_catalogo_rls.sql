-- SPEC 03 · Paso 3 — RLS del catálogo (`categorias`, `productos`).
--
-- Lectura: cualquier usuario autenticado ve el catálogo (lo consumirán las
-- vistas de movimientos/historial de specs siguientes). Escritura (insert/
-- update/delete): solo admin/superadmin, reutilizando is_admin() del Spec 02.
-- auth/is_admin envueltos en (select ...) para que el optimizador los cachee
-- por sentencia (initPlan), como en 0002_profiles_rls.

alter table public.categorias enable row level security;
alter table public.productos  enable row level security;

-- ---------------------------------------------------------------------------
-- LECTURA: cualquier autenticado.
-- ---------------------------------------------------------------------------
create policy "categorias_select" on public.categorias for select
  to authenticated using ( true );

create policy "productos_select" on public.productos for select
  to authenticated using ( true );

-- ---------------------------------------------------------------------------
-- ESCRITURA (insert/update/delete): solo admin/superadmin.
-- ---------------------------------------------------------------------------
create policy "categorias_write" on public.categorias for all
  to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

create policy "productos_write" on public.productos for all
  to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );
