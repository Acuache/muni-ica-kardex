import { getProfile } from "@/lib/auth/profile"
import type { Area, UsuarioRow } from "@/lib/usuarios/types"
import { createClient } from "@/lib/supabase/server"

import { UsuariosClient } from "./usuarios-client"

type ProfileRow = {
  id: string
  email: string | null
  nombre: string | null
  telefono: string | null
  role: UsuarioRow["role"]
  area_id: string | null
  perfil_completo: boolean
  // PostgREST tipa la relación embebida como arreglo (sin tipos generados de BD).
  areas: { nombre: string }[] | { nombre: string } | null
}

/**
 * Página de gestión de usuarios (`/admin/usuarios`). El shell admin (layout) ya
 * aplica el guard de rol (admin/superadmin). Aquí se listan las cuentas (con el
 * nombre del área resuelto por join) y las áreas para el select; el CRUD lo
 * maneja el componente cliente vía Server Actions.
 */
export default async function UsuariosPage() {
  const supabase = await createClient()
  const yo = await getProfile()

  const [{ data: perfiles }, { data: areas }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, nombre, telefono, role, area_id, perfil_completo, areas ( nombre )",
      )
      .order("email"),
    supabase.from("areas").select("id, nombre, created_at").order("nombre"),
  ])

  const usuarios: UsuarioRow[] = (
    (perfiles ?? []) as unknown as ProfileRow[]
  ).map((p) => {
    const area = Array.isArray(p.areas) ? p.areas[0] : p.areas
    return {
      id: p.id,
      email: p.email,
      nombre: p.nombre,
      telefono: p.telefono,
      role: p.role,
      area_id: p.area_id,
      area_nombre: area?.nombre ?? null,
      perfil_completo: p.perfil_completo,
    }
  })

  return (
    <main className="flex-1 p-6">
      <UsuariosClient
        usuarios={usuarios}
        areas={(areas ?? []) as Area[]}
        currentUserId={yo?.id ?? ""}
      />
    </main>
  )
}
