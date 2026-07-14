import "server-only"

import { createClient } from "@supabase/supabase-js"

/**
 * Cliente admin de Supabase (**service role**) — Spec 04.
 *
 * Usa la llave secreta `SUPABASE_SERVICE_ROLE_KEY` para la **Auth Admin API**
 * (`auth.admin.createUser` / `deleteUser` / `updateUserById`), operaciones
 * imposibles con la llave pública. Esta llave **se salta la RLS**, así que:
 *
 *   · `import "server-only"` rompe el build si este módulo se importa desde un
 *     componente cliente (garantía de que la llave nunca llega al navegador).
 *   · Solo se usa dentro de Server Actions (`app/admin/usuarios/actions.ts`).
 *   · `SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_`, de modo que
 *     Next nunca la incluye en el bundle del cliente.
 *
 * `persistSession`/`autoRefreshToken` en `false`: este cliente es efímero y sin
 * sesión de usuario (no maneja cookies), solo ejerce la Admin API.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
