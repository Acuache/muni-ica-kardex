# SPEC 01 — Autenticación y fundación Supabase

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-07-13
> **Objetivo:** Configurar el cliente SSR de Supabase y permitir login/logout con sesión persistente y rutas protegidas.

---

## Alcance

**In:**

- Cliente browser de Supabase en `lib/supabase/client.ts` (vía `createBrowserClient` de `@supabase/ssr`), usando `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Cliente servidor de Supabase en `lib/supabase/server.ts` (vía `createServerClient`), leyendo/escribiendo cookies con la API async de Next 16.
- `proxy.ts` en la raíz (reemplazo de `middleware.ts` en Next 16): refresca la sesión en cada request y redirige a `/login` a quien no tenga sesión en rutas privadas.
- Página `/login` (`app/login/page.tsx`): card shadcn con el logo municipal, campos email + password, mensaje de error inline.
- Server Action de login (`signInWithPassword`) que, en éxito, redirige a `/dashboard`; en error, devuelve el mensaje a la página.
- Server Action de logout (`signOut`) disparada desde un botón en `/dashboard`.
- Página placeholder `/dashboard` (`app/dashboard/page.tsx`): ruta protegida mínima que revalida con `getUser()` y muestra el email de la sesión + botón de cerrar sesión.
- Raíz `/` (`app/page.tsx`): redirige a `/dashboard` si hay sesión, a `/login` si no.
- Componentes shadcn necesarios para el login: `input`, `label`, `card` (el `button` ya existe).

**Fuera de alcance (para specs futuros):**

- Roles y autorización por rol (superadmin/admin/usuario) y layouts diferenciados → **Spec 02**.
- Tabla `profiles`, trigger de alta y seed del superadmin → **Spec 02**.
- Registro público / creación de usuarios y la Admin API con service role → **Spec 04** (los usuarios los crean admin y superadmin).
- Magic link, recuperación y cambio de contraseña.
- `react-hook-form` + `zod` (la validación de formularios se introduce en el **Spec 03**).
- Cualquier contenido real del dashboard (rankings, stock, etc.) → Specs 05–07.

---

## Modelo de datos

Este spec **no introduce tablas ni estructuras de datos nuevas**. Se apoya por completo en `auth.users` de Supabase, gestionado por Supabase Auth; no hay esquema propio que definir todavía (la tabla `profiles` y los roles llegan en el **Spec 02**).

Lo único que este spec maneja es la **sesión**, y no la modelamos nosotros: vive en cookies HTTP administradas por `@supabase/ssr`. Para referencia, la forma con la que trabajará el código:

```ts
// Lo que devuelve supabase.auth.getUser() en el servidor
// (no lo definimos; es el tipo User de @supabase/supabase-js)
type User = {
  id: string        // uuid de auth.users
  email: string
  // ...otros campos de Supabase Auth
}
```

**Variables de entorno** que consume este spec (ya presentes en `.env`, no se crean):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

---

## Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante la implementación (`/spec-impl`) se consulta **context7** antes de escribir código de `@supabase/ssr` y de Next 16 (proxy, cookies async, redirect), por los breaking changes.

1. **Clientes Supabase.** Crear `lib/supabase/client.ts` (`createBrowserClient`) y `lib/supabase/server.ts` (`createServerClient` con la API async de cookies de Next 16). Ambos leen las dos env vars públicas. *Test:* `npm run build` compila sin errores de tipos.

2. **Componentes shadcn del login.** Añadir `input`, `label` y `card` (el `button` ya existe) vía la skill/CLI de shadcn. *Test:* los componentes aparecen en `components/ui/` y la app compila.

3. **Login: página + Server Action.** Crear `app/login/actions.ts` con la acción `login` (`signInWithPassword`) que redirige a `/dashboard` en éxito y devuelve el mensaje de error en fallo. Crear `app/login/page.tsx`: card con logo (`app/assets/logo.jpg`), form nativo email+password que postea a la acción, y mensaje de error inline. *Test:* con un usuario creado a mano en el panel de Supabase Auth, credenciales válidas autentican (se setea la cookie) y credenciales inválidas muestran el error inline. El destino `/dashboard` aún da 404 — se resuelve en el paso 4.

4. **Placeholder `/dashboard` + logout.** Crear `app/dashboard/page.tsx` (server component) que llama `getUser()`, redirige a `/login` si no hay usuario, y muestra el email + un botón «Cerrar sesión». Añadir la Server Action `logout` (`signOut`) que redirige a `/login`. *Test:* tras login llegas a `/dashboard` y ves tu email; el botón cierra sesión y vuelve a `/login`.

5. **`proxy.ts` (refresco + guard global).** Crear `proxy.ts` en la raíz: refresca la sesión en cada request y redirige a `/login` a quien no tenga usuario, salvo en la ruta pública `/login` (y assets estáticos vía `config.matcher`). *Test:* recargar `/dashboard` mantiene la sesión (persiste); sin sesión, cualquier ruta privada redirige a `/login`.

6. **Raíz `/` con redirect por sesión.** Reemplazar la home scaffold de Next en `app/page.tsx` por una redirección: a `/dashboard` si hay sesión, a `/login` si no. *Test:* visitar `/` autenticado lleva a `/dashboard`; sin sesión lleva a `/login`.

---

## Criterios de aceptación

- [x] `lib/supabase/client.ts` y `lib/supabase/server.ts` existen y la app compila (`npm run build`) sin errores de tipos.
- [x] Un usuario con credenciales válidas (creado a mano en Supabase Auth) inicia sesión desde `/login` y llega a `/dashboard`.
- [x] Credenciales inválidas muestran un mensaje de error inline en `/login` y **no** inician sesión.
- [x] `/dashboard` muestra el email del usuario autenticado.
- [x] El botón «Cerrar sesión» borra la sesión y redirige a `/login`.
- [x] Sin sesión, visitar `/dashboard` (o cualquier ruta privada) redirige a `/login`.
- [x] Con sesión activa, recargar `/dashboard` mantiene la sesión (el `proxy.ts` la refresca; no expulsa al usuario).
- [x] Visitar `/` redirige a `/dashboard` si hay sesión y a `/login` si no.

---

## Decisiones

- **Sí:** solo email + password (`signInWithPassword`). Es lo más simple y cubre a todos los roles; los usuarios los crean admin y superadmin con contraseña (Spec 04).
- **No:** magic link / OTP por correo. Añade callback route y plantillas de correo sin necesidad real ahora.
- **Sí:** formulario con Server Action + form nativo. Cero dependencias nuevas y encaja con SSR.
- **No:** `react-hook-form` + `zod` en este spec. La librería de formularios se introduce en el Spec 03 (primer CRUD), como marca el roadmap.
- **No:** componente cliente con `supabase-js` en el browser para el login. La Server Action mantiene la credencial y el manejo de sesión en el servidor.
- **Sí:** defensa en profundidad para rutas privadas — `proxy.ts` redirige y además cada página revalida con `getUser()` en el servidor. Es el patrón recomendado por Supabase; nunca confiar solo en `getSession()`.
- **Sí:** `getUser()` (no `getSession()`) como fuente de verdad de autenticación en el servidor, porque revalida el token contra Supabase.
- **Sí:** `/dashboard` como ruta protegida placeholder. Da un destino real para probar el login sin adelantar los shells por rol (Spec 02).
- **Sí:** `/` redirige según sesión y se elimina la home scaffold de Next. La app no tiene landing público; todo requiere sesión.
- **No:** service role key / Admin API en este spec. Solo se usa la publishable key; la creación de usuarios llega en Spec 04.
- **Sí:** usar `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (naming nuevo de Supabase), que ya está en `.env`, en vez del antiguo `ANON_KEY`.
- **Sí:** `proxy.ts` en la raíz en lugar de `middleware.ts`. En Next 16 el middleware se renombró a proxy (runtime nodejs); es donde `@supabase/ssr` hace el refresco de sesión.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Confiar en `getSession()` en el servidor (no revalida el token, puede falsear autenticación) | Usar `getUser()` como fuente de verdad en server y en `proxy.ts`; nunca autorizar solo con `getSession()`. |
| `proxy.ts` mal configurado (matcher) intercepta assets estáticos o deja rutas privadas sin cubrir | `config.matcher` que excluye `_next/static`, `_next/image`, favicon e imágenes; probar que `/dashboard` sin sesión redirige y que los assets cargan. |
| Cookies mal escritas entre Server Action / proxy → sesión que no persiste al recargar | Seguir el patrón oficial `@supabase/ssr` (getAll/setAll) verificado con context7; el criterio de aceptación cubre la recarga. |
| Env vars ausentes o mal nombradas en `.env` (build o runtime rompe silencioso) | Los clientes leen `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; fallar temprano si faltan. |
| Breaking changes de Next 16 (`proxy.ts` en vez de `middleware.ts`, cookies async) frente a conocimiento previo | Consulta obligatoria a context7 + `node_modules/next/dist/docs/` antes de escribir el proxy y los clientes. |

---

## Lo que **no** entra en este spec

- Roles y autorización por rol, tabla `profiles`, trigger y seed del superadmin (→ Spec 02).
- Creación/edición/eliminación de usuarios y la Admin API con service role (→ Spec 04).
- Magic link, recuperación y cambio de contraseña.
- `react-hook-form` + `zod` (→ Spec 03).
- Contenido real del dashboard (→ Specs 05–07).

Cada uno, cuando llegue, va en su propio spec.
