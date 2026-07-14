import type { Categoria } from "@/lib/catalogo/types"
import { createClient } from "@/lib/supabase/server"

import { CategoriasClient } from "./categorias-client"

/**
 * Página de gestión de categorías (`/admin/categorias`). El shell admin
 * (layout) ya aplica el guard de rol. Aquí se listan las categorías en el
 * servidor y el CRUD (alta/edición en diálogo, borrado con confirmación) lo
 * maneja el componente cliente.
 */
export default async function CategoriasPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("categorias")
    .select("id, nombre, descripcion, created_at")
    .order("nombre")

  return (
    <main className="flex-1 p-6">
      <CategoriasClient categorias={(data ?? []) as Categoria[]} />
    </main>
  )
}
