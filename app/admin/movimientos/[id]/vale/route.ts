/**
 * Vale de salida en PDF (Spec 06 / 06.1) — `GET /admin/movimientos/<id>/vale`.
 *
 * Es la única salida del sistema hacia el papel. No genera un hecho nuevo:
 * reimprime uno ya ocurrido, así que se arma al vuelo, es idempotente y no
 * toca ni el stock ni el movimiento (solo lee).
 *
 * Vale consolidado (Spec 06.1): si el movimiento pertenece a un lote, el vale
 * lista TODAS las filas del lote agrupadas por categoría, con el folio más bajo
 * del lote en el encabezado. Un movimiento sin lote es un lote de uno: mismo
 * camino, un solo grupo con un item. El botón "Vale" de cualquiera de las filas
 * del lote baja este mismo documento.
 *
 * ⚠️ GUARD PROPIO, a propósito: los Route Handlers NO ejecutan
 * `app/admin/layout.tsx`, así que el `requireRole()` que protege las páginas de
 * /admin no cubre esta ruta. Además `requireRole()` hace `redirect()`, que no
 * tiene sentido en una descarga binaria: aquí se responde 403 seco. La RLS de
 * `movimientos` (`is_admin()`, Spec 05) es la segunda barrera.
 */
import { getProfile } from "@/lib/auth/profile"
import type { MovimientoVale } from "@/lib/movimientos/types"
import { construirDatosVale, nombreArchivoVale } from "@/lib/movimientos/vale"
import { createClient } from "@/lib/supabase/server"

import { renderVale } from "./vale-pdf"

/** Producto embebido, con su categoría anidada (join productos → categorias). */
type ProductoEmbed = {
  nombre: string
  sku: string
  categorias: { nombre: string } | null
} | null

/** Fila del movimiento con los embeds de producto (+ categoría) y área. */
type MovimientoRow = {
  folio: number
  fecha: string
  cantidad: number
  motivo: string | null
  productos: ProductoEmbed
  areas: { nombre: string } | null
}

/** El movimiento consultado por id, con lo que hace falta para resolver el lote. */
type CabeceraRow = MovimientoRow & {
  tipo: "entrada" | "salida"
  usuario_id: string | null
  lote_id: string
  lotes: { numero: number } | null
}

/** Autor del movimiento resuelto desde `profiles`. */
type AutorRow = { nombre: string | null; email: string | null } | null

// Columnas del embed reutilizadas por ambas consultas (cabecera y filas del lote).
const SELECT_FILA =
  "folio, fecha, cantidad, motivo, productos(nombre, sku, categorias(nombre)), areas(nombre)"

/**
 * Mapea una fila leída a la forma que consume `construirDatosVale`. El
 * `lote_numero` es el mismo para todo el lote (viene de la cabecera), así que se
 * pasa aparte en vez de re-embeberlo en cada fila.
 */
function aMovimientoVale(
  row: MovimientoRow,
  autor: AutorRow,
  loteNumero: number,
): MovimientoVale {
  return {
    folio: row.folio,
    lote_numero: loteNumero,
    fecha: row.fecha,
    cantidad: row.cantidad,
    motivo: row.motivo,
    producto_nombre: row.productos?.nombre ?? null,
    producto_sku: row.productos?.sku ?? null,
    categoria_nombre: row.productos?.categorias?.nombre ?? null,
    area_nombre: row.areas?.nombre ?? null,
    autor_nombre: autor?.nombre ?? null,
    autor_email: autor?.email ?? null,
  }
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/admin/movimientos/[id]/vale">,
) {
  const profile = await getProfile()
  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    return new Response("No autorizado", { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = await createClient()

  // El embed de `productos` resuelve también los dados de baja: su política de
  // lectura no filtra `eliminado`, y el vale de una entrega que sí ocurrió no
  // puede desaparecer porque después se diera de baja el producto (Spec 05).
  const { data } = await supabase
    .from("movimientos")
    .select(`tipo, usuario_id, lote_id, lotes(numero), ${SELECT_FILA}`)
    .eq("id", id)
    .maybeSingle()

  const cabecera = data as CabeceraRow | null

  // Un id inexistente y una entrada son lo mismo de cara al vale: no existe tal
  // documento. Solo las salidas se entregan y se firman.
  if (!cabecera || cabecera.tipo !== "salida") {
    return new Response("No encontrado", { status: 404 })
  }

  // `usuario_id` apunta a `auth.users`, no a `profiles`, así que no hay embed
  // posible: el autor se resuelve aparte. Es el mismo para todo el lote (se
  // registró junto). Si la cuenta fue eliminada, el vale sale con "—".
  let autor: AutorRow = null
  if (cabecera.usuario_id) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre, email")
      .eq("id", cabecera.usuario_id)
      .maybeSingle()
    autor = perfil as AutorRow
  }

  // Si el movimiento pertenece a un lote, se leen TODAS sus filas (Spec 06.1);
  // si no, el lote es esta única fila.
  let filas: MovimientoRow[]
  if (cabecera.lote_id) {
    const { data: loteData } = await supabase
      .from("movimientos")
      .select(SELECT_FILA)
      .eq("lote_id", cabecera.lote_id)
      .order("folio")
    filas = (loteData as MovimientoRow[] | null) ?? [cabecera]
  } else {
    filas = [cabecera]
  }

  // El número de lote es el mismo para todo el lote; identifica el documento.
  const loteNumero = cabecera.lotes?.numero ?? 0
  const entradas = filas.map((f) => aMovimientoVale(f, autor, loteNumero))
  const datos = construirDatosVale(entradas)

  const buffer = await renderVale(datos)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivoVale(loteNumero)}"`,
      // El vale reimprime un hecho inmutable, pero puede contener datos de
      // personas: que no lo cachee ningún intermediario.
      "Cache-Control": "private, no-store",
    },
  })
}
