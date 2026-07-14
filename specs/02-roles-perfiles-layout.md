# SPEC 02 — Roles, perfiles y layout por rol

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-07-13
> **Objetivo:** Distinguir a superadmin, admin y usuario mediante perfiles con RLS y enrutar a cada rol a su shell, exigiendo completar el perfil (nombre, teléfono) en el primer inicio.

---

## Alcance

**In:**

- **Tabla `profiles`** (1:1 con `auth.users`) con columnas: `id`, `email` (copia de `auth.users.email`, sincronizada por trigger), `nombre`, `telefono`, `role` (`superadmin`/`admin`/`usuario`), `area_id` (uuid null, **sin FK todavía**), `perfil_completo` (boolean default false), `created_at`.
- **Trigger `on_auth_user_created`** en `auth.users`: al crear un usuario inserta su fila en `profiles` con `role` por defecto `'usuario'`, copia su `email` y deja el resto de campos personales vacíos (`perfil_completo=false`). Un segundo trigger `on_auth_user_email_updated` mantiene el `email` sincronizado si cambia en Auth.
- **RLS de `profiles`:** cada quien lee su propia fila; admin y superadmin leen todas; el usuario puede actualizar solo sus datos personales (`nombre`, `telefono`, `perfil_completo`), nunca su `role` ni su `area_id`; escritura de gestión (rol/área de otros) reservada a admin y superadmin.
- **Protección DB del superadmin:** trigger/policy que **impide** cambiar el `role` del superadmin y **impide eliminar** su fila de `profiles`, pase lo que pase con la UI.
- **Seed del único superadmin:** SQL que, buscando por email, fija `role='superadmin'` sobre un usuario creado a mano en el panel de Supabase Auth. Sin credenciales en el código.
- **Helpers de auth en servidor** (`lib/auth/`): leer el perfil de la sesión y resolver a dónde debe ir cada rol; guard reutilizable que redirige por sesión/rol/perfil incompleto.
- **Dos shells con segmento visible en la URL:**
  - `app/admin/layout.tsx` → shell de admin (sidebar), para **admin y superadmin**, bajo `/admin/…`.
  - `app/usuario/layout.tsx` → shell mínimo de usuario, bajo `/usuario/…`.
- **Migración de rutas:** el `/dashboard` del Spec 01 pasa a `app/admin/dashboard/page.tsx` (`/admin/dashboard`); se crea `app/usuario/dashboard/page.tsx` como placeholder (`/usuario/dashboard`).
- **Redirección por rol tras login:** admin/superadmin → `/admin/dashboard`; usuario → `/usuario/dashboard`; y si el perfil está incompleto → `/completar-perfil` antes que nada.
- **Onboarding de primer inicio** (`app/completar-perfil/`): formulario (nombre + teléfono) que, al enviarse, marca `perfil_completo=true` y libera el shell. Aplica a cualquier rol con el perfil incompleto.
- **Guard de cruce de roles:** cada `layout.tsx` de shell lee el rol en servidor y redirige si el rol no corresponde a ese segmento.
- El sidebar del shell admin muestra **solo lo que ya existe** (Dashboard); los demás módulos se agregan en su propio spec.

**Fuera de alcance (para specs futuros):**

- La tabla `areas` y la **FK** `profiles.area_id → areas(id)`; la **asignación de área** la hace el admin → **Spec 04**.
- La **UI de gestión de usuarios** (crear/editar/eliminar cuentas, Admin API con service role) → **Spec 04**. Aquí solo van el esquema, la RLS y la protección del superadmin en la base.
- El CRUD de catálogo, movimientos, PDF, dashboard real y la vista de historial del usuario → **Specs 03–08**. Sus enlaces se agregan al sidebar cuando lleguen.
- Cualquier modo de "tomar/simular rol" (impersonación) — descartado.
- `react-hook-form` + `zod`: la librería de formularios se introduce en el **Spec 03**; el formulario de onboarding usa Server Action + form nativo, como el login del Spec 01.

---

## Modelo de datos

Este spec introduce **una tabla nueva** (`profiles`) más el trigger que la puebla, la RLS y la protección del superadmin. Las estructuras viven en Postgres de Supabase; se definen por migración SQL en `supabase/migrations/`.

### Tabla `profiles` (1:1 con `auth.users`)

```sql
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text,
  telefono        text,
  role            text not null default 'usuario'
                    check (role in ('superadmin','admin','usuario')),
  area_id         uuid,                 -- sin FK todavía; el Spec 04 la añade a areas(id)
  perfil_completo boolean not null default false,
  created_at      timestamptz not null default now()
);
```

- `role` arranca en `'usuario'`; el `check` es la única fuente de valores válidos.
- `area_id` queda **sin FK** a propósito (la tabla `areas` es del Spec 04); es un `uuid` nullable por ahora.
- `perfil_completo` es la bandera explícita que dispara (o libera) el onboarding; no se infiere de campos vacíos.
- `on delete cascade`: si se elimina el usuario en `auth.users`, su perfil se va con él (la protección del superadmin, abajo, impide llegar a ese punto para el superadmin).

### Trigger de alta — crea el perfil

```sql
-- Al insertar en auth.users, crea la fila mínima en profiles.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Solo siembra `id`; `nombre`/`telefono` los llena el usuario en el onboarding y `role`/`area_id` los define admin/superadmin (Spec 04) — salvo el `role` por defecto `'usuario'`.

### RLS de `profiles`

```sql
alter table public.profiles enable row level security;

-- helper: ¿el que llama es admin o superadmin?
create function public.is_admin() returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin','superadmin')
  );
$$;

-- LECTURA: cada quien su fila; admin/superadmin, todas.
create policy "profiles_select" on public.profiles for select
  using ( id = (select auth.uid()) or (select public.is_admin()) );

-- UPDATE propio: solo datos personales; nunca role ni area_id (se valida con trigger, abajo).
create policy "profiles_update_own" on public.profiles for update
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- UPDATE de gestión (rol/área de otros): solo admin/superadmin.
create policy "profiles_update_admin" on public.profiles for update
  using ( (select public.is_admin()) );
```

### Protección del superadmin (a nivel de base)

```sql
-- Impide degradar de rol al superadmin y evita que un no-admin se auto-suba el rol/área.
create function public.guard_profile_write() returns trigger
  language plpgsql security definer set search_path = '' as $$
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
end; $$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_write();

-- impide eliminar la fila del superadmin
create function public.guard_profile_delete() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'superadmin' then
    raise exception 'No se puede eliminar al superadmin';
  end if;
  return old;
end; $$;

create trigger guard_profile_delete before delete on public.profiles
  for each row execute function public.guard_profile_delete();
```

### Seed del superadmin

```sql
-- supabase/seed.sql — el usuario ya fue creado a mano en el panel de Supabase Auth.
update public.profiles
   set role = 'superadmin'
 where id = (select id from auth.users where email = 'v.acuache15@gmail.com');
```

El email exacto se confirma al implementar; no hay contraseñas ni service role en el código.

**Regla del onboarding:** un perfil con `perfil_completo=false` no accede a ningún shell; el guard lo manda a `/completar-perfil`. Al enviar el formulario se setea `nombre`, `telefono` y `perfil_completo=true` sobre la propia fila (permitido por `profiles_update_own`).

---

## Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir SQL de Supabase (RLS, triggers, `security definer`) y de Next 16 (rutas, `redirect`, Server Actions).

1. **Migración `profiles` + trigger de alta.** Crear `supabase/migrations/NN_profiles.sql` con la tabla y el trigger `handle_new_user` / `on_auth_user_created`. *Test:* aplicar la migración; crear un usuario de prueba en el panel de Auth crea su fila en `profiles` con `role='usuario'` y `perfil_completo=false`.

2. **RLS de `profiles`.** Añadir `enable row level security`, el helper `is_admin()` y las policies `profiles_select`, `profiles_update_own`, `profiles_update_admin`. *Test:* con la sesión de un usuario normal, `select` sobre `profiles` devuelve solo su fila.

3. **Protección del superadmin.** Añadir `guard_profile_write` (before update) y `guard_profile_delete` (before delete) con sus triggers. *Test:* `update profiles set role='usuario' where role='superadmin'` y `delete from profiles where role='superadmin'` fallan con excepción.

4. **Seed del superadmin.** Crear el usuario a mano en el panel de Auth; `supabase/seed.sql` fija `role='superadmin'` por email. *Test:* tras correr el seed existe exactamente un `profile` con `role='superadmin'`.

5. **Helpers de auth en servidor.** Crear `lib/auth/profile.ts` (`getProfile()` lee la fila de `profiles` de la sesión) y `lib/auth/landing.ts` (`resolveLanding(profile)` → `/completar-perfil` | `/admin/dashboard` | `/usuario/dashboard`), función pura. *Test:* unit test Vitest de `resolveLanding` cubriendo admin, usuario y perfil incompleto.

6. **Guard de rol reutilizable.** Crear `lib/auth/require-role.ts`: helper de servidor que valida sesión + perfil completo + rol esperado y hace `redirect` si no corresponde. *Test:* se verifica vía los shells en los pasos 8–9 (no testeable en Vitest por ser async server).

7. **Onboarding de primer inicio.** Crear `app/completar-perfil/page.tsx` (form nativo nombre + teléfono) y `app/completar-perfil/actions.ts` (Server Action que actualiza la propia fila, setea `perfil_completo=true` y redirige con `resolveLanding`). Si el perfil ya está completo, la página redirige al shell. *Test:* un usuario con perfil incompleto es enviado aquí; al enviar datos válidos queda `perfil_completo=true` y aterriza en su shell.

8. **Shell admin + migración de `/dashboard`.** Crear `app/admin/layout.tsx` (sidebar con solo "Dashboard" + botón cerrar sesión) usando `require-role` para admin/superadmin; mover el dashboard placeholder a `app/admin/dashboard/page.tsx` y la acción `logout` a `app/admin/dashboard/actions.ts`; eliminar `app/dashboard/`. *Test:* un admin/superadmin ve `/admin/dashboard` con su email y el sidebar; un usuario que entra a `/admin/dashboard` es redirigido a su shell.

9. **Shell usuario.** Crear `app/usuario/layout.tsx` (shell mínimo + cerrar sesión) con `require-role` para usuario y `app/usuario/dashboard/page.tsx` placeholder. *Test:* un usuario ve `/usuario/dashboard`; un admin que entra ahí es redirigido a `/admin/dashboard`.

10. **Redirección por rol en login y raíz.** Actualizar `app/login/actions.ts` para redirigir con `resolveLanding(await getProfile())` en vez de `/dashboard`; actualizar `app/page.tsx` (`/`) para enrutar por rol/perfil en vez de a `/dashboard`. *Test:* login de admin → `/admin/dashboard`; login de usuario → `/usuario/dashboard`; login con perfil incompleto → `/completar-perfil`; visitar `/` autenticado enruta igual.

---

## Criterios de aceptación

- [x] Al crear un usuario en `auth.users` se crea automáticamente su fila en `profiles` con `role='usuario'` y `perfil_completo=false`.
- [x] `profiles.role` solo admite `superadmin`, `admin` o `usuario` (el `check` rechaza cualquier otro valor).
- [x] Tras el seed existe **exactamente un** `profile` con `role='superadmin'`.
- [x] Un intento de cambiar el `role` del superadmin (UPDATE) es rechazado por la base.
- [x] Un intento de eliminar la fila del superadmin (DELETE) es rechazado por la base.
- [x] Un usuario normal, vía RLS, solo lee su propia fila de `profiles`; un admin/superadmin lee todas.
- [x] Un usuario normal no puede cambiar su propio `role` ni su `area_id` (rechazado por trigger).
- [x] Un usuario con `perfil_completo=false` es redirigido a `/completar-perfil` y no accede a ningún shell.
- [x] Al enviar el formulario de onboarding con nombre y teléfono, `perfil_completo` pasa a `true` y el usuario aterriza en el shell de su rol.
- [x] Un admin y un superadmin ven el shell de admin (`/admin/dashboard`, con sidebar); un usuario ve el shell de usuario (`/usuario/dashboard`).
- [x] Un usuario que visita `/admin/dashboard` es redirigido a su shell; un admin que visita `/usuario/dashboard` es redirigido al suyo.
- [x] Tras el login, cada rol es enviado a su landing correcto (o a `/completar-perfil` si el perfil está incompleto).
- [x] El rol y el estado del perfil se leen en el **servidor** (helpers `lib/auth/`), no solo en el cliente.
- [x] `resolveLanding` tiene tests unitarios (Vitest) que cubren admin, usuario y perfil incompleto.

---

## Decisiones

- **Sí:** rol por defecto `'usuario'` en `profiles.role`. El admin/superadmin se asignan por seed (superadmin) o por Spec 04 (admins); ningún alta pública sube de rol sola.
- **Sí:** el superadmin se siembra creándolo **a mano** en el panel de Auth y un `seed.sql` le fija el rol por email. Cero credenciales/service role en el código en este spec.
- **No:** crear el superadmin con un script Node + Admin API en el Spec 02. Mete el service role antes de tiempo (el roadmap lo reserva al Spec 04).
- **Sí:** protección del superadmin con **triggers `before update/delete`**, además de RLS. La Admin API (Spec 04) salta la RLS con service role, pero **no** salta los triggers `before`; así la garantía es real.
- **Sí:** el rol como **segmento visible** en la URL (`/admin/…`, `/usuario/…`), cada uno con su `layout.tsx`. Superadmin comparte el segmento `/admin`.
- **No:** route groups invisibles `(admin)`/`(usuario)` con URL `/dashboard` plana. Se prefirió el rol explícito en la ruta.
- **Sí:** guard de rol en cada `layout.tsx` de shell (leyendo el perfil en servidor), además de la RLS de datos. Doble capa, como el patrón del Spec 01.
- **No:** meter lógica de roles en `proxy.ts`. El proxy sigue haciendo solo el guard de sesión del Spec 01; los roles se resuelven en los layouts/helpers.
- **Sí:** `area_id` como `uuid` **sin FK** ahora; el Spec 04 añade la FK a `areas(id)` cuando exista la tabla.
- **Sí:** el **admin** asigna el área del usuario (Spec 04); el usuario **no** elige su área (evita que se auto-asigne a cualquier área y vea su historial).
- **Sí:** onboarding de primer inicio para **cualquier** rol con `perfil_completo=false` (incluido el superadmin sembrado); pide solo datos personales (nombre, teléfono).
- **Sí:** `perfil_completo` como **bandera booleana explícita**, no inferida de `nombre IS NULL`.
- **Sí:** el onboarding usa **Server Action + form nativo** (sin `react-hook-form`/`zod`), para no adelantar la librería de formularios que el roadmap reserva al Spec 03.
- **No:** impersonación / "tomar rol". Descartado en el roadmap.
- **Sí:** el sidebar del shell admin muestra **solo Dashboard** por ahora; cada módulo agrega su enlace en su propio spec (sin rutas muertas).

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La Admin API (Spec 04, service role) **salta la RLS** y podría degradar/eliminar al superadmin. | La protección va en **triggers `before update/delete`**, que el service role **no** salta; la garantía no depende de la RLS. |
| Recursión/`permission denied` al consultar `profiles` dentro de las propias policies de `profiles`. | El helper `is_admin()` es `security definer` con `search_path=''`; se prueba que un usuario normal puede leer su fila sin error de recursión. |
| Trigger `handle_new_user` sin `security definer` no puede insertar en `profiles` (falla el alta de usuarios). | La función es `security definer` con `search_path=''`; test: crear un usuario en Auth crea la fila sin error. |
| Un usuario se salta el onboarding entrando directo a una URL de shell. | El guard (`require-role`) vive en el `layout.tsx` de cada shell y corre en **servidor** en cada request; sin `perfil_completo=true` redirige a `/completar-perfil`. |
| La migración de `/dashboard` a `/admin/dashboard` deja enlaces/redirects viejos apuntando a `/dashboard` (404). | El paso 10 actualiza `login/actions.ts` y `app/page.tsx`; criterio de aceptación cubre el landing por rol. |
| Un usuario normal cambia su `role`/`area_id` vía un UPDATE directo permitido por `profiles_update_own`. | El trigger `guard_profile_write` rechaza cambios de `role`/`area_id` hechos por un no-admin, aunque la policy de fila lo permita. |

---

## Lo que **no** entra en este spec

- La tabla `areas`, la FK `profiles.area_id → areas(id)` y la asignación de área (→ Spec 04).
- La UI de gestión de usuarios (crear/editar/eliminar cuentas, Admin API con service role) (→ Spec 04).
- El CRUD de catálogo, movimientos, PDF, dashboard real e historial del usuario (→ Specs 03–08).
- `react-hook-form` + `zod` (→ Spec 03).
- Impersonación / simulación de rol.

Cada uno, cuando llegue, va en su propio spec.
