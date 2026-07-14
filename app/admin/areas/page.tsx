import type { Area } from "@/lib/usuarios/types"
import { createClient } from "@/lib/supabase/server"

import { AreasClient } from "./areas-client"

/**
 * Página de gestión de áreas (`/admin/areas`). El shell admin (layout) ya
 * aplica el guard de rol. Aquí se listan las áreas en el servidor y el CRUD
 * (alta/edición en diálogo, borrado con confirmación) lo maneja el componente
 * cliente.
 */
export default async function AreasPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("areas")
    .select("id, nombre, created_at")
    .order("nombre")

  return (
    <main className="flex-1 p-6">
      <AreasClient areas={(data ?? []) as Area[]} />
    </main>
  )
}
