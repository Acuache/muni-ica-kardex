import type { Profile } from "./profile"

/**
 * Resuelve a dónde debe ir un perfil recién autenticado. Función **pura**
 * (sin I/O) para poder testearla en Vitest:
 *
 *   1. Perfil incompleto  → `/completar-perfil` (antes que nada, cualquier rol).
 *   2. Rol `usuario`      → `/usuario/dashboard`.
 *   3. Rol admin/superadmin → `/admin/dashboard` (comparten el shell de admin).
 */
export function resolveLanding(
  profile: Pick<Profile, "role" | "perfil_completo">,
): string {
  if (!profile.perfil_completo) return "/completar-perfil"
  if (profile.role === "usuario") return "/usuario/dashboard"
  return "/admin/dashboard"
}
