/**
 * Vale de salida en PDF (Spec 06) — `GET /admin/movimientos/<id>/vale`.
 *
 * Es la única salida del sistema hacia el papel. No genera un hecho nuevo:
 * reimprime uno ya ocurrido, así que se arma al vuelo, es idempotente y no
 * toca ni el stock ni el movimiento (solo lee).
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

/** Fila del movimiento con los embeds de producto y área ya resueltos. */
type MovimientoRow = {
  folio: number
  tipo: "entrada" | "salida"
  fecha: string
  cantidad: number
  motivo: string | null
  usuario_id: string | null
  productos: { nombre: string; sku: string } | null
  areas: { nombre: string } | null
}

/** Autor del movimiento resuelto desde `profiles`. */
type AutorRow = { nombre: string | null; email: string | null } | null

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
    .select(
      "folio, tipo, fecha, cantidad, motivo, usuario_id, productos(nombre, sku), areas(nombre)",
    )
    .eq("id", id)
    .maybeSingle()

  const mov = data as MovimientoRow | null

  // Un id inexistente y una entrada son lo mismo de cara al vale: no existe tal
  // documento. Solo las salidas se entregan y se firman.
  if (!mov || mov.tipo !== "salida") {
    return new Response("No encontrado", { status: 404 })
  }

  // `usuario_id` apunta a `auth.users`, no a `profiles`, así que no hay embed
  // posible: el autor se resuelve aparte (igual que en la tabla de movimientos).
  // Si la cuenta fue eliminada, `usuario_id` es null y el vale sale con "—".
  let autor: AutorRow = null
  if (mov.usuario_id) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre, email")
      .eq("id", mov.usuario_id)
      .maybeSingle()
    autor = perfil as AutorRow
  }

  const entrada: MovimientoVale = {
    folio: mov.folio,
    fecha: mov.fecha,
    cantidad: mov.cantidad,
    motivo: mov.motivo,
    producto_nombre: mov.productos?.nombre ?? null,
    producto_sku: mov.productos?.sku ?? null,
    area_nombre: mov.areas?.nombre ?? null,
    autor_nombre: autor?.nombre ?? null,
    autor_email: autor?.email ?? null,
  }

  const buffer = await renderVale(construirDatosVale(entrada))

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivoVale(mov.folio)}"`,
      // El vale reimprime un hecho inmutable, pero puede contener datos de
      // personas: que no lo cachee ningún intermediario.
      "Cache-Control": "private, no-store",
    },
  })
}
