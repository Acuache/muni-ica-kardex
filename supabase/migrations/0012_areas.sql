-- SPEC 04 · Paso 1 — Tabla `areas` + cierre de la FK `profiles.area_id` + RLS.
--
-- Las áreas son los destinatarios de las salidas de almacén (ficticias por
-- ahora). El Spec 02 dejó `profiles.area_id` como uuid SIN FK; aquí se crea la
-- tabla `areas` y se cierra esa FK con `on delete restrict` (no se elimina un
-- área con usuarios asignados, mismo patrón que categorias→productos del Spec 03).
-- Reusa `is_admin()` del Spec 02 para la escritura.

-- ---------------------------------------------------------------------------
-- Tabla `areas`
-- ---------------------------------------------------------------------------
create table public.areas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.areas is
  'Áreas destinatarias de las salidas de almacén (Spec 04). nombre único.';

-- ---------------------------------------------------------------------------
-- FK de `profiles.area_id` → `areas(id)`
-- ---------------------------------------------------------------------------
-- El Spec 02 dejó area_id como uuid sin FK; aquí se cierra.
-- · area_id sigue NULLABLE: un admin (o un usuario recién creado) puede no tener área.
-- · on delete restrict: no se puede eliminar un área referenciada por algún perfil.
alter table public.profiles
  add constraint profiles_area_id_fkey
  foreign key (area_id) references public.areas(id) on delete restrict;

-- Índice para la FK (acelera el chequeo del restrict y los filtros por área).
create index profiles_area_id_idx on public.profiles (area_id);

-- ---------------------------------------------------------------------------
-- RLS de `areas`
-- ---------------------------------------------------------------------------
-- Lectura: cualquier autenticado (para los selects de los formularios de
-- usuarios). Escritura (insert/update/delete): solo admin/superadmin, vía
-- is_admin() del Spec 02. auth/is_admin envueltos en (select ...) para que el
-- optimizador los cachee por sentencia (initPlan), como en 0002/0009.
alter table public.areas enable row level security;

create policy "areas_select" on public.areas for select
  to authenticated using ( true );

create policy "areas_write" on public.areas for all
  to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );
