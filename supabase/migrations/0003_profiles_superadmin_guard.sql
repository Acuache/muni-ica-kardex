-- SPEC 02 · Paso 3 — Protección del superadmin (a nivel de base).
--
-- Doble capa sobre la RLS: estos triggers `before` corren SIEMPRE, incluso
-- cuando la Admin API (Spec 04, service role) se salta la RLS. Así la garantía
-- de que el superadmin no se puede degradar ni eliminar es real, no depende de
-- las policies.

-- ---------------------------------------------------------------------------
-- Guard de UPDATE
-- ---------------------------------------------------------------------------
-- 1) Nadie cambia el rol del superadmin.
-- 2) Un no-admin no puede tocar su propio role ni area_id, aunque la policy
--    profiles_update_own le permita escribir el resto de su fila.
create function public.guard_profile_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- nadie cambia el rol del superadmin
  if old.role = 'superadmin' and new.role <> 'superadmin' then
    raise exception 'No se puede cambiar el rol del superadmin';
  end if;
  -- un usuario no admin no puede tocar su propio role ni area_id
  if not public.is_admin()
     and (new.role <> old.role or new.area_id is distinct from old.area_id) then
    raise exception 'No autorizado para cambiar rol o área';
  end if;
  return new;
end;
$$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_write();

-- ---------------------------------------------------------------------------
-- Guard de DELETE — impide eliminar la fila del superadmin
-- ---------------------------------------------------------------------------
create function public.guard_profile_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if old.role = 'superadmin' then
    raise exception 'No se puede eliminar al superadmin';
  end if;
  return old;
end;
$$;

create trigger guard_profile_delete
  before delete on public.profiles
  for each row execute function public.guard_profile_delete();
