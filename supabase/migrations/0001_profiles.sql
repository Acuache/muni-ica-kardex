-- SPEC 02 · Paso 1 — Tabla `profiles` (1:1 con auth.users) + trigger de alta.
--
-- Cada usuario de Supabase Auth tiene exactamente una fila en public.profiles.
-- El trigger la crea automáticamente al registrarse el usuario, sembrando solo
-- el `id`; el resto de campos personales los completa el onboarding (Spec 02,
-- paso 7) y `role`/`area_id` los define el admin/superadmin (seed / Spec 04).

-- ---------------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text,
  telefono        text,
  role            text not null default 'usuario'
                    check (role in ('superadmin', 'admin', 'usuario')),
  area_id         uuid,                 -- sin FK todavía; el Spec 04 la añade a areas(id)
  perfil_completo boolean not null default false,
  created_at      timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil 1:1 con auth.users. role controla el acceso por rol; perfil_completo dispara el onboarding.';
comment on column public.profiles.area_id is
  'Área destinataria del usuario. uuid sin FK por ahora; el Spec 04 añade la FK a areas(id).';
comment on column public.profiles.perfil_completo is
  'Bandera explícita del onboarding: false = debe completar nombre/telefono antes de entrar a su shell.';

-- ---------------------------------------------------------------------------
-- Trigger de alta — crea la fila mínima en profiles al registrarse un usuario
-- ---------------------------------------------------------------------------
-- security definer + search_path='' es obligatorio: la función corre con los
-- privilegios del owner (puede insertar en public.profiles) y el search_path
-- vacío evita que un search_path manipulado resuelva `profiles` a otra tabla.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
