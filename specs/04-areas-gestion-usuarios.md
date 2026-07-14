# SPEC 04 — Áreas y gestión de usuarios

> **Estado:** Implementado
> **Depende de:** SPEC 02
> **Fecha:** 2026-07-14
> **Objetivo:** Permitir a admin y superadmin gestionar (CRUD) las áreas destinatarias y las cuentas del sistema —crear usuarios con la Auth Admin API (rol admin/usuario, área, contraseña por defecto), editarlos, resetear su contraseña y eliminarlos— salvo al superadmin, a quien nadie puede eliminar ni degradar.

---

## 1. Por qué existe este spec

Es el **primer spec que usa el `service role` de Supabase** (la Auth Admin API). Un usuario no se puede "crear a sí mismo" con la llave pública: dar de alta, borrar o resetear la contraseña de una cuenta en `auth.users` exige privilegios que solo tiene la llave secreta, y esa llave **jamás** puede llegar al navegador. Por eso toda operación de cuentas vive en Server Actions con un cliente admin server-only.

Además cierra la deuda que el Spec 02 dejó abierta: la tabla `areas` y la **FK** `profiles.area_id → areas(id)`. Con las áreas ya existentes, el admin puede asignar a cada usuario el área cuyo historial verá (Spec 08).

---

## 2. Alcance

**In:**

- **Tabla `areas`** (`id`, `nombre` único, `created_at`) con RLS: lectura para cualquier autenticado, escritura solo `is_admin()` (reusa el helper del Spec 02).
- **FK `profiles.area_id → areas(id)` `on delete restrict`**: cierra la columna que el Spec 02 dejó sin FK; `area_id` sigue siendo **nullable** (un admin puede no tener área). No se puede eliminar un área que tenga usuarios asignados.
- **Cliente admin server-only** (`lib/supabase/admin.ts`): usa `SUPABASE_SERVICE_ROLE_KEY` (nueva variable en `.env`, **sin** prefijo `NEXT_PUBLIC_`). Solo se importa desde Server Actions.
- **Página de Áreas** (`/admin/areas`): tabla de listado + alta/edición en **diálogo (modal)** + borrado con confirmación (`AlertDialog`). El borrado de un área con usuarios se rechaza en base (FK `restrict`) y muestra un mensaje claro.
- **Página de Usuarios** (`/admin/usuarios`): tabla de listado (email, nombre, rol, área) + alta/edición en **diálogo** + **resetear contraseña** + borrado con confirmación. Visible para **admin y superadmin**.
- **Alta de usuario** (Auth Admin API `createUser`): campos **obligatorios** email + rol (`admin`/`usuario`) + área (obligatoria solo si el rol es `usuario`); campos **opcionales** de primer ingreso nombre + teléfono. La contraseña se fija al valor por defecto **`usuarioNuevo`** y el email se marca confirmado (`email_confirm: true`) para que el usuario entre de inmediato.
- **Datos de primer ingreso opcionales:** si el admin captura **nombre y teléfono** en el alta, la cuenta nace con `perfil_completo=true` (sin onboarding); si los deja vacíos, el usuario los completa en su primer login con el onboarding del Spec 02.
- **Edición de usuario:** modificar **nombre, teléfono, rol** (`admin`↔`usuario`) y **área**. **Resetear contraseña** devuelve la contraseña al valor por defecto `usuarioNuevo`.
- **Eliminación de usuario** (Auth Admin API `deleteUser`): borra la cuenta en `auth.users`, que arrastra su fila en `profiles` (`on delete cascade` del Spec 02).
- **Blindaje del superadmin en la UI y el servidor:** el superadmin aparece en la lista pero sus acciones destructivas y de cambio de rol (eliminar, degradar, resetear contraseña) están **deshabilitadas**; cualquier intento por API es rechazado en el servidor (además de los triggers `before update/delete` del Spec 02, que ni el service role salta).
- **Autoprotección:** un admin **no** puede eliminar ni degradar (a `usuario`) su propia cuenta; el guard vive en la Server Action.
- **Server Actions** de áreas (`crear`/`editar`/`eliminar`, con RLS `is_admin()` + zod + `revalidatePath`) y de usuarios (`crear`/`editar`/`resetearPassword`/`eliminar`, con guard `is_admin()` en servidor + Auth Admin API).
- **Esquemas zod** compartidos (`lib/usuarios/schemas.ts`) y constante `PASSWORD_POR_DEFECTO` (`lib/usuarios/constants.ts`).
- **Seed de áreas ficticias** (~5–6) en `supabase/seed.sql`.
- **Navegación:** dos enlaces sueltos en el sidebar del shell admin — **Áreas** y **Usuarios**.

**Fuera de alcance (para specs futuros):**

- **Crear o eliminar superadmins desde la UI:** el superadmin es único, sembrado por seed (Spec 02) e ineliminable/indegradable.
- **Cambiar el email de acceso** de una cuenta: se decidió no exponerlo (dato sensible); se puede añadir luego.
- **Invitaciones por correo / auto-registro / recuperación de contraseña por email:** requieren SMTP; el reset lo hace el admin devolviendo la contraseña por defecto.
- **Forzar el cambio de contraseña** en el primer login (o tras un reset): a futuro; por ahora la contraseña por defecto se usa tal cual.
- **Múltiples áreas por usuario** (N:M): un usuario pertenece a **una** sola área.
- **`responsable`/`descripcion` del área:** el área solo tiene `nombre`; campos extra se añaden si hacen falta.
- **Permisos finos** más allá de los 3 roles; **soft-delete** de áreas o usuarios (aquí borrado físico).
- La **vista del historial** del usuario por área → **Spec 08**; aquí solo se asigna el `area_id`.

---

## 3. Modelo de datos

Este spec introduce **una tabla nueva** (`areas`) y **cierra la FK** de `profiles.area_id`. Todo se define por migración SQL en `supabase/migrations/0012_areas.sql`. Reusa `is_admin()` y los triggers de protección del superadmin del Spec 02.

### Tabla `areas`

```sql
create table public.areas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  created_at timestamptz not null default now()
);
```

### FK de `profiles.area_id`

```sql
-- el Spec 02 dejó area_id como uuid sin FK; aquí se cierra.
alter table public.profiles
  add constraint profiles_area_id_fkey
  foreign key (area_id) references public.areas(id) on delete restrict;
```

- `area_id` sigue **nullable**: un admin (o un usuario recién creado) puede no tener área.
- `on delete restrict`: no se puede eliminar un área referenciada por algún perfil; el intento se rechaza en base y la UI muestra un mensaje claro (mismo patrón que `categorias`→`productos` del Spec 03).

### RLS de `areas`

```sql
alter table public.areas enable row level security;

-- LECTURA: cualquier usuario autenticado ve las áreas (para selects en formularios).
create policy "areas_select" on public.areas for select
  to authenticated using ( true );

-- ESCRITURA (insert/update/delete): solo admin y superadmin, vía is_admin() del Spec 02.
create policy "areas_write" on public.areas for all
  to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
```

### Cliente admin (service role) — `lib/supabase/admin.ts`

Cliente server-only que usa la llave secreta para la Auth Admin API. **Nunca** se importa desde un componente cliente.

```ts
// forma tentativa; se ajusta al implementar
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // nueva variable en .env, sin NEXT_PUBLIC_
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
```

Nueva variable en `.env`:

```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxxxxxx
```

### Flujo de alta de usuario (dos clientes)

El alta usa **dos** clientes a propósito, para pedir el mínimo privilegio en cada paso:

1. **Cliente admin (service role):** `auth.admin.createUser({ email, password: PASSWORD_POR_DEFECTO, email_confirm: true })`. El trigger `on_auth_user_created` del Spec 02 crea la fila en `profiles` con `role='usuario'` y `perfil_completo=false`.
2. **Cliente de la sesión del admin (RLS):** `update` sobre esa fila para fijar `role`, `area_id`, y —si se capturaron— `nombre`, `telefono`, `perfil_completo`.

El paso 2 **no** usa el service role a propósito: el trigger `guard_profile_write` del Spec 02 rechaza cambios de `role`/`area_id` cuando `is_admin()` es falso, y bajo el service role `auth.uid()` es `null` (→ `is_admin()` falso). Con la sesión del admin, `is_admin()` es verdadero y tanto la RLS (`profiles_update_admin`) como el guard lo permiten.

### Constante y esquemas zod

```ts
// lib/usuarios/constants.ts
export const PASSWORD_POR_DEFECTO = 'usuarioNuevo'

// lib/usuarios/schemas.ts  (forma tentativa)
export const areaSchema = z.object({
  nombre: z.string().min(1),
})

export const usuarioCrearSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'usuario']),          // 'superadmin' nunca es opción
  area_id: z.string().uuid().optional(),
  nombre: z.string().optional(),
  telefono: z.string().optional(),
}).refine(v => v.role !== 'usuario' || !!v.area_id, {
  message: 'Un usuario necesita un área asignada',
  path: ['area_id'],
})

export const usuarioEditarSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['admin', 'usuario']),
  area_id: z.string().uuid().optional(),
  nombre: z.string().optional(),
  telefono: z.string().optional(),
}).refine(v => v.role !== 'usuario' || !!v.area_id, {
  message: 'Un usuario necesita un área asignada',
  path: ['area_id'],
})
```

---

## 4. Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir código de Supabase (RLS, **Auth Admin API**, `@supabase/supabase-js`), Next 16 (Server Actions, `revalidatePath`), `react-hook-form`/`zod` y shadcn.

1. **Migración `areas` + FK + RLS.** Crear `supabase/migrations/0012_areas.sql` con la tabla `areas`, la FK `profiles.area_id → areas(id) on delete restrict` y las políticas `areas_select` (authenticated) y `areas_write` (`is_admin()`). *Test:* aplicar la migración; insertar un área funciona; asignar `area_id` a un perfil funciona; borrar un área referenciada por un perfil falla (restrict).

2. **Seed de áreas.** Añadir a `supabase/seed.sql` ~5–6 áreas ficticias (Logística, Contabilidad, Recursos Humanos, Mesa de Partes, Gerencia). *Test:* tras el seed existen las áreas y aparecen en un `select`.

3. **Cliente admin server-only.** Crear `lib/supabase/admin.ts` (`createAdminClient` con `SUPABASE_SERVICE_ROLE_KEY` + `import 'server-only'`); documentar la variable en `.env`/`.env.example` y verificar que `.env` está en `.gitignore`. *Test:* `npm run build` compila; importar el cliente desde un componente cliente rompe el build (garantía de `server-only`).

4. **Constante + esquemas zod.** Crear `lib/usuarios/constants.ts` (`PASSWORD_POR_DEFECTO`) y `lib/usuarios/schemas.ts` (`areaSchema`, `usuarioCrearSchema`, `usuarioEditarSchema`). *Test:* unit tests Vitest (área con nombre vacío falla; `role='usuario'` sin `area_id` falla; `role='admin'` sin área pasa; caso válido pasa).

5. **Server Actions + página de Áreas.** Crear `app/admin/areas/actions.ts` (`crear`/`editar`/`eliminar`, guard `is_admin()` en servidor, `areaSchema`, `revalidatePath`; `eliminar` captura el error de FK `restrict` y devuelve "no se puede eliminar: tiene usuarios asignados") y `app/admin/areas/page.tsx` (server component que lista + componentes cliente: tabla, `Dialog` con form rhf+zod, `AlertDialog`). Añadir el enlace **Áreas** al sidebar. *Test:* un admin crea/edita/borra un área desde el modal; borrar un área con usuarios muestra el mensaje; un usuario que entra a `/admin/areas` es redirigido (guard del Spec 02).

6. **Server Actions de Usuarios.** Crear `app/admin/usuarios/actions.ts`:
   - `crear`: guard `is_admin()`; `createUser` (service role, `PASSWORD_POR_DEFECTO`, `email_confirm:true`); luego, con la sesión del admin, `update` de `role`/`area_id`/`nombre`/`telefono`/`perfil_completo`; captura el error de email duplicado.
   - `editar`: guard; rechaza si el objetivo es el superadmin o si el admin se degrada a sí mismo; `update` de perfil vía sesión del admin.
   - `resetearPassword`: guard; rechaza si el objetivo es el superadmin; `updateUserById(id, { password: PASSWORD_POR_DEFECTO })` (service role).
   - `eliminar`: guard; rechaza si el objetivo es el superadmin o es uno mismo; `deleteUser(id)` (service role).
   *Test:* crear un usuario válido lo deja logueable con `usuarioNuevo`; email duplicado devuelve mensaje; resetear/eliminar/degradar al superadmin es rechazado; un admin no puede eliminarse ni degradarse a sí mismo.

7. **Página de Usuarios.** Crear `app/admin/usuarios/page.tsx` (lista con email, nombre, rol y nombre de área) + componentes cliente (tabla, `Dialog` de alta rhf+zod: email, rol, área —requerida si rol=`usuario`—, nombre y teléfono opcionales; `Dialog` de edición; botón **Resetear contraseña** con confirmación; `AlertDialog` de borrado). El superadmin aparece con sus acciones destructivas/de rol **deshabilitadas**. Añadir el enlace **Usuarios** al sidebar. *Test:* admin y superadmin ven la pantalla; crear un usuario con rol y área lo deja logueable; el superadmin no muestra eliminar/degradar/reset; un usuario que entra a `/admin/usuarios` es redirigido.

8. **Verificación integral.** `npm run lint` y `npm test`, más una pasada manual de ambos CRUD (incluido login del usuario recién creado). *Test:* todos los criterios de aceptación se cumplen.

---

## 5. Criterios de aceptación

- [x] admin y superadmin ven y usan la pantalla de gestión de usuarios (`/admin/usuarios`); un usuario que entra ahí es redirigido.
- [x] admin o superadmin crea un usuario con email, rol (`admin`/`usuario`) y área; ese usuario puede iniciar sesión con la contraseña `usuarioNuevo`.
- [x] El alta marca el email como confirmado (`email_confirm:true`), de modo que el usuario entra sin verificación por correo.
- [x] Si el alta captura nombre **y** teléfono, la cuenta nace con `perfil_completo=true` (sin onboarding); si no, el usuario los completa en su primer login.
- [x] Un usuario con rol `usuario` **requiere** área (zod lo rechaza sin `area_id`); un `admin` puede crearse sin área.
- [x] admin y superadmin editan nombre, teléfono, rol (`admin`↔`usuario`) y área de una cuenta.
- [x] Resetear la contraseña devuelve el acceso con `usuarioNuevo`.
- [x] admin y superadmin eliminan admins y usuarios; su fila en `profiles` se va por `on delete cascade`.
- [x] El superadmin **no** aparece como eliminable, degradable ni reseteable en la UI, y cualquier intento por API es rechazado en el servidor.
- [x] Un admin **no** puede eliminar ni degradar su propia cuenta.
- [x] Un email **duplicado** en el alta se rechaza con un mensaje claro.
- [x] Toda operación de cuentas ocurre en Server Actions; la `SUPABASE_SERVICE_ROLE_KEY` nunca se expone al cliente (sin `NEXT_PUBLIC_`, cliente admin con `import 'server-only'`).
- [x] admin y superadmin crean, editan y eliminan **áreas** desde `/admin/areas`; el seed carga ~5–6 áreas ficticias.
- [x] Eliminar un área **con usuarios asignados** es rechazado por la base (FK `restrict`) y la UI muestra un mensaje claro.
- [x] `areas.nombre` es único: un nombre duplicado se rechaza.
- [x] Un usuario **no admin**, vía RLS, puede **leer** las áreas pero **no** insertarlas/editarlas/eliminarlas.
- [x] Los esquemas zod (`areaSchema`, `usuarioCrearSchema`, `usuarioEditarSchema`) tienen tests unitarios (Vitest) con casos válidos e inválidos.
- [x] El sidebar del shell admin muestra los enlaces **Áreas** y **Usuarios**.

---

## 6. Decisiones

- **Sí:** **service role** (`SUPABASE_SERVICE_ROLE_KEY`) en `.env` sin `NEXT_PUBLIC_`, en un cliente `lib/supabase/admin.ts` con `import 'server-only'`, usado solo en Server Actions. Crear/borrar/resetear cuentas exige la Auth Admin API, imposible con la llave pública.
- **Sí:** el **update del perfil** tras el alta usa la **sesión del admin**, no el service role. El trigger `guard_profile_write` del Spec 02 rechaza cambios de `role`/`area_id` cuando `is_admin()` es falso, y bajo service role `auth.uid()` es `null`; con la sesión del admin el guard y la RLS lo permiten. Se pide el mínimo privilegio en cada paso.
- **Sí:** **contraseña por defecto `usuarioNuevo`** para toda cuenta nueva, con `email_confirm:true`. Simple y sin depender de SMTP; el reset la vuelve a poner.
- **No:** contraseña generada/temporal, invitación por email o forzar cambio en el primer login. Requieren UI/flujos extra o SMTP; se reservan a futuro.
- **Sí:** **una** área por usuario (`profiles.area_id`), cerrando la FK que el Spec 02 dejó pendiente, con `on delete restrict`. Coincide con el modelo existente y basta para el historial (Spec 08).
- **No:** múltiples áreas por usuario (N:M). Cambia el modelo y complica el historial sin necesidad ahora.
- **Sí:** al borrar un área con usuarios, **restrict** (bloquea) con mensaje claro, igual que `categorias`→`productos` del Spec 03. Evita usuarios huérfanos de área.
- **No:** `set null` (desasignar) o soft-delete del área. El primero deja huérfanos; el segundo añade una bandera y filtros en toda la UI.
- **Sí:** roles asignables/editables **`admin`↔`usuario`** libremente; `superadmin` nunca es opción y sus triggers del Spec 02 lo blindan aun contra el service role (los triggers `before` no se saltan).
- **Sí:** el superadmin aparece en la lista pero con acciones destructivas/de rol **deshabilitadas**; el rechazo real está en el servidor (guard + triggers), no solo en la UI.
- **Sí:** **autoprotección** — un admin no puede eliminar ni degradar su propia cuenta (guard en la Server Action). Evita quedarse sin acceso por accidente.
- **Sí:** **área solo con `nombre`** (único). Minimalista; `responsable`/`descripcion` se añaden si hacen falta.
- **Sí:** **datos de primer ingreso opcionales** en el alta (nombre + teléfono); si están ambos, `perfil_completo=true`; si no, reusa el onboarding del Spec 02.
- **No:** **cambiar el email** de acceso desde la UI. Dato sensible; se puede añadir luego con `updateUserById`.
- **Sí:** **borrado físico** de áreas y usuarios (no soft-delete), consistente con el Spec 03.
- **Sí:** formularios en **diálogo (modal)** sobre la lista y **enlaces sueltos** en el sidebar (Áreas, Usuarios), como el Spec 03.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La `SUPABASE_SERVICE_ROLE_KEY` se filtra al cliente (bundle) y expone acceso total saltándose la RLS. | Variable **sin** `NEXT_PUBLIC_`; cliente admin con `import 'server-only'` (rompe el build si se importa en cliente); se usa solo en Server Actions; `.env` en `.gitignore`. |
| El alta falla al fijar `role`/`area_id` si el update se hace con el **service role** (el guard del Spec 02 lo rechaza porque `auth.uid()` es `null`). | El update del perfil se hace con la **sesión del admin** (`is_admin()`=true); el service role se limita a `createUser`/`deleteUser`/`updateUserById`. |
| La Auth Admin API (service role) **salta la RLS** y podría eliminar/degradar al superadmin. | Guard en la Server Action (objetivo ≠ superadmin) **y** los triggers `before update/delete` del Spec 02, que el service role **no** salta: el `deleteUser` del superadmin aborta por la excepción del trigger. |
| La contraseña por defecto `usuarioNuevo` es débil y compartida. | Documentado como decisión; el admin puede resetear; forzar cambio en el primer login queda como mejora futura. Aceptable para datos ficticios de esta etapa. |
| Un admin se degrada o se elimina a sí mismo y pierde el acceso. | Guard de autoprotección en la Server Action (objetivo ≠ uno mismo para eliminar/degradar). |
| El error de FK `restrict` al borrar un área con usuarios llega crudo al usuario. | La Server Action `eliminar` captura el error de la base y devuelve un mensaje claro. |
| El error de email duplicado (`createUser`) llega crudo. | Se captura el error de la Auth Admin API y se devuelve un mensaje inline en el formulario. |

---

## 8. Lo que **no** entra en este spec

- Crear o eliminar **superadmins** desde la UI (el superadmin es único, sembrado por seed e ineliminable/indegradable).
- Cambiar el **email de acceso** de una cuenta.
- **Invitaciones por correo**, auto-registro y recuperación de contraseña por email; forzar cambio de contraseña en el primer login.
- **Múltiples áreas** por usuario; campos extra del área (`responsable`, `descripcion`).
- **Soft-delete** de áreas o usuarios; permisos finos más allá de los 3 roles.
- La **vista del historial** del usuario por área (→ Spec 08).

Cada uno, cuando llegue, va en su propio spec.
