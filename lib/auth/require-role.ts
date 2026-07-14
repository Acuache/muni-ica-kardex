import { redirect } from "next/navigation"

import { resolveLanding } from "./landing"
import { getProfile, type Profile, type Role } from "./profile"

/**
 * Guard de servidor para los `layout.tsx` de cada shell. Corre en cada request
 * y, en orden:
 *
 *   1. Sin sesión / sin perfil → `/login`.
 *   2. Perfil incompleto       → `/completar-perfil`.
 *   3. Rol no permitido en este segmento → su propio landing (`resolveLanding`).
 *
 * Si todo pasa, devuelve el `Profile` para que el layout lo use (p. ej. email).
 * `redirect()` lanza internamente, así que el tipo se estrecha a `Profile`.
 */
export async function requireRole(allowed: Role[]): Promise<Profile> {
  const profile = await getProfile()

  if (!profile) redirect("/login")
  if (!profile.perfil_completo) redirect("/completar-perfil")
  if (!allowed.includes(profile.role)) redirect(resolveLanding(profile))

  return profile
}
