import type { Categoria, Producto } from "@/lib/catalogo/types"
import { createClient } from "@/lib/supabase/server"

import { ProductosClient } from "./productos-client"

/**
 * Página de gestión de productos (`/admin/productos`). El shell admin (layout)
 * ya aplica el guard de rol. Se listan productos y categorías en el servidor; el
 * nombre de categoría se resuelve desde la lista de categorías (sin embed).
 */
export default async function ProductosPage() {
  const supabase = await createClient()

  const [{ data: productosRaw }, { data: categoriasRaw }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, sku, nombre, categoria_id, stock_actual, stock_minimo, es_perecible, fecha_caducidad, imagen_path, created_at",
      )
      // Soft-delete (Spec 05): el catálogo solo muestra productos vigentes.
      .eq("eliminado", false)
      .order("nombre"),
    supabase
      .from("categorias")
      .select("id, nombre, descripcion, created_at")
      .order("nombre"),
  ])

  const categorias = (categoriasRaw ?? []) as Categoria[]
  const catPorId = new Map(categorias.map((c) => [c.id, c.nombre]))

  const productos: Producto[] = ((productosRaw ?? []) as Producto[]).map((p) => ({
    ...p,
    categoria_nombre: catPorId.get(p.categoria_id) ?? null,
  }))

  return (
    <main className="flex-1 p-6">
      <ProductosClient productos={productos} categorias={categorias} />
    </main>
  )
}
