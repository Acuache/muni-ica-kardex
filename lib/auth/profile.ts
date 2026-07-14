import { createClient } from "@/lib/supabase/server"

/** Roles del sistema. Única fuente de verdad en TS; en la BD lo fija el `check`. */
export type Role = "superadmin" | "admin" | "usuario"

/** Fila de `public.profiles` tal como la consume el servidor. */
export type Profile = {
  id: string
  email: string | null
  nombre: string | null
  telefono: string | null
  role: Role
  area_id: string | null
  perfil_completo: boolean
}

/** Columnas que leemos de `profiles` (evita `select *`). */
const PROFILE_COLUMNS = "id, email, nombre, telefono, role, area_id, perfil_completo"

/**
 * Lee el perfil del usuario de la sesión desde `public.profiles`.
 * Devuelve `null` si no hay sesión o si (por lo que sea) no existe su fila.
 * La RLS garantiza que un usuario solo puede leer la suya.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single()

  if (error || !data) return null
  return data as Profile
}
