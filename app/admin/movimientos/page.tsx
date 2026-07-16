import type {
  AreaOpcion,
  Movimiento,
  ProductoOpcion,
} from "@/lib/movimientos/types"
import { createClient } from "@/lib/supabase/server"

import { MovimientosClient } from "./movimientos-client"

type ProductoRow = {
  id: string
  nombre: string
  sku: string
  stock_actual: number
  eliminado: boolean
  categoria_id: string
}

type MovimientoRow = {
  id: string
  folio: number
  lote_id: string
  tipo: "entrada" | "salida"
  producto_id: string
  cantidad: number
  area_id: string | null
  usuario_id: string | null
  motivo: string | null
  fecha: string
}

/**
 * Página de Movimientos / kardex (`/admin/movimientos`). El shell admin (layout)
 * ya aplica el guard de rol. Sigue el patrón de la página de productos: se leen
 * las filas en el servidor y los nombres (producto/área/usuario) se resuelven
 * con `Map`, sin embeds. Los nombres de producto se resuelven para TODOS los
 * productos (incluidos los soft-eliminados) para que el historial no pierda su
 * identidad. Respeta `searchParams.producto` para la vista de kardex por
 * producto (Next 16: searchParams es un Promise).
 */
export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>
}) {
  const { producto: productoParam } = await searchParams
  const supabase = await createClient()

  let movQuery = supabase
    .from("movimientos")
    .select(
      "id, folio, lote_id, tipo, producto_id, cantidad, area_id, usuario_id, motivo, fecha",
    )
    .order("fecha", { ascending: false })
  if (productoParam) movQuery = movQuery.eq("producto_id", productoParam)

  const [
    { data: movsRaw },
    { data: productosRaw },
    { data: areasRaw },
    { data: categoriasRaw },
    { data: lotesRaw },
  ] = await Promise.all([
    movQuery,
    // TODOS los productos (incl. eliminados) para resolver nombres en el
    // historial; los vigentes se derivan luego para el `select` del formulario.
    supabase
      .from("productos")
      .select("id, nombre, sku, stock_actual, eliminado, categoria_id")
      .order("nombre"),
    supabase.from("areas").select("id, nombre").order("nombre"),
    // Nombres de categoría para agrupar los productos en el formulario (Spec 06.1).
    // Se resuelven con Map, no con embed — el patrón del resto de la página.
    supabase.from("categorias").select("id, nombre"),
    // Correlativo de cada lote (Spec 06.1); se resuelve con Map, no con embed.
    supabase.from("lotes").select("id, numero"),
  ])

  const productos = (productosRaw ?? []) as ProductoRow[]
  const areas = (areasRaw ?? []) as AreaOpcion[]
  const movRows = (movsRaw ?? []) as MovimientoRow[]
  const categorias = (categoriasRaw ?? []) as { id: string; nombre: string }[]
  const lotes = (lotesRaw ?? []) as { id: string; numero: number }[]

  const prodPorId = new Map(productos.map((p) => [p.id, p]))
  const areaPorId = new Map(areas.map((a) => [a.id, a.nombre]))
  const catPorId = new Map(categorias.map((c) => [c.id, c.nombre]))
  const loteNumPorId = new Map(lotes.map((l) => [l.id, l.numero]))

  // Emails de quienes registraron (join manual usuario_id → profiles.id; la RLS
  // deja al admin leer todas las filas de profiles).
  const userIds = [
    ...new Set(movRows.map((m) => m.usuario_id).filter(Boolean)),
  ] as string[]
  const emailPorId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds)
    for (const p of (profs ?? []) as { id: string; email: string | null }[]) {
      if (p.email) emailPorId.set(p.id, p.email)
    }
  }

  const movimientos: Movimiento[] = movRows.map((m) => {
    const prod = prodPorId.get(m.producto_id)
    return {
      id: m.id,
      folio: m.folio,
      lote_id: m.lote_id,
      lote_numero: loteNumPorId.get(m.lote_id) ?? 0,
      tipo: m.tipo,
      producto_id: m.producto_id,
      producto_nombre: prod?.nombre ?? null,
      producto_sku: prod?.sku ?? null,
      cantidad: m.cantidad,
      area_id: m.area_id,
      area_nombre: m.area_id ? (areaPorId.get(m.area_id) ?? null) : null,
      usuario_id: m.usuario_id,
      usuario_email: m.usuario_id ? (emailPorId.get(m.usuario_id) ?? null) : null,
      motivo: m.motivo,
      fecha: m.fecha,
    }
  })

  // Solo productos vigentes se pueden mover: alimentan el `select` del formulario.
  const productosVigentes: ProductoOpcion[] = productos
    .filter((p) => !p.eliminado)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      sku: p.sku,
      stock_actual: p.stock_actual,
      categoria_id: p.categoria_id,
      // Sin categoría resuelta no debería ocurrir (categoría obligatoria).
      categoria_nombre: catPorId.get(p.categoria_id) ?? "Sin categoría",
    }))

  // Si la vista viene pre-filtrada por producto, su nombre para el encabezado.
  const productoFiltrado = productoParam
    ? {
        id: productoParam,
        nombre: prodPorId.get(productoParam)?.nombre ?? "Producto",
      }
    : null

  return (
    <main className="flex-1 p-6">
      <MovimientosClient
        movimientos={movimientos}
        productos={productosVigentes}
        areas={areas}
        productoFiltrado={productoFiltrado}
      />
    </main>
  )
}
