-- SPEC 02 · Paso 4 — Seed del único superadmin.
--
-- El usuario raíz se crea A MANO en el panel de Supabase Auth (Authentication →
-- Users → Add user). Este seed solo le fija role='superadmin' buscándolo por
-- email. Cero credenciales / service role en el código.
--
-- Requisito previo: haber creado en Auth el usuario con este email, y haber
-- aplicado las migraciones (el trigger on_auth_user_created ya habrá insertado
-- su fila en public.profiles con role='usuario').

-- Backfill: si el superadmin (u otros usuarios) se crearon en Auth ANTES de
-- existir la tabla profiles, el trigger de alta no llegó a poblar su fila.
-- Este insert idempotente la crea con los valores por defecto (role='usuario').
insert into public.profiles (id)
select u.id
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null;

-- El guard `guard_profile_write` bloquea cualquier cambio de rol hecho por un
-- no-admin (y en el seed `auth.uid()` es null → no es admin). Se desactiva el
-- trigger SOLO durante este UPDATE administrativo y se reactiva enseguida; el
-- guard queda intacto para el resto de operaciones.
alter table public.profiles disable trigger guard_profile_update;

update public.profiles
   set role = 'superadmin'
 where id = (
   select id from auth.users where email = 'v.acuache15@gmail.com'
 );

alter table public.profiles enable trigger guard_profile_update;
