-- SPEC 02 · Cambio — `role` pasa de text+check a un enum de Postgres.
--
-- Motivo: con un enum, el Table Editor de Supabase muestra un desplegable con
-- los valores válidos (mejor UX) y la validez la garantiza el propio tipo, no
-- solo un check. Los roles son fijos por dominio, así que la rigidez del enum
-- (añadir/quitar valores requiere ALTER TYPE) es aceptable.

-- 1) Tipo enum con los tres roles.
create type public.user_role as enum ('superadmin', 'admin', 'usuario');

-- 2) Quitar el check (redundante con el enum) y el default text antes de mutar.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles alter column role drop default;

-- 3) Convertir la columna al enum (los valores actuales ya son válidos).
alter table public.profiles
  alter column role type public.user_role using role::public.user_role;

-- 4) Restaurar el default, ahora tipado como enum.
alter table public.profiles alter column role set default 'usuario'::public.user_role;
