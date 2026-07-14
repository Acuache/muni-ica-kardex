-- SPEC 02 · Añadido — columna `email` en profiles (copia de auth.users.email).
--
-- Denormalización de conveniencia: evita un segundo viaje a auth.users para
-- mostrar/consultar el correo. La fuente de verdad sigue siendo auth.users;
-- aquí se mantiene una copia sincronizada por triggers.

alter table public.profiles add column email text;

comment on column public.profiles.email is
  'Copia de auth.users.email, mantenida por los triggers handle_new_user y handle_user_email_update.';

-- ---------------------------------------------------------------------------
-- El trigger de alta ahora también copia el email.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sincroniza el email si cambia en auth.users.
-- ---------------------------------------------------------------------------
create function public.handle_user_email_update()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_update();

-- Estas funciones son de trigger: no deben ser invocables por RPC.
revoke execute on function public.handle_user_email_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill de las filas existentes.
-- ---------------------------------------------------------------------------
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;
