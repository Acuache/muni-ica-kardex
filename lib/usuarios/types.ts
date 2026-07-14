import type { Role } from "@/lib/auth/profile"

/** Fila de `public.areas`, tal como la consume la UI (Spec 04). */
export type Area = {
  id: string
  nombre: string
  created_at: string
}

/**
 * Fila de usuario para la pantalla de gestión (`/admin/usuarios`). Combina el
 * perfil con el nombre del área resuelto por join. `email` viene de la copia
 * denormalizada en `profiles` (Spec 02).
 */
export type UsuarioRow = {
  id: string
  email: string | null
  nombre: string | null
  telefono: string | null
  role: Role
  area_id: string | null
  area_nombre: string | null
  perfil_completo: boolean
}
