"use server"

import { revalidatePath } from "next/cache"

import { getProfile } from "@/lib/auth/profile"
import { movimientoLoteSchema } from "@/lib/movimientos/schemas"
import { createClient } from "@/lib/supabase/server"

/**
 * Resultado del registro de un lote. En el caso exitoso devuelve el id de un
 * movimiento del lote (el de folio más bajo), con el que el cliente arma la URL
 * del vale para descargarlo.
 */
export type LoteResult =
  | { ok: true; movimientoId: string }
  | { ok: false; error: string }

/** Guard de servidor: solo admin/superadmin (defensa en profundidad sobre la RLS). */
async function esAdmin(): Promise<boolean> {
  const profile = await getProfile()
  return !!profile && (profile.role === "admin" || profile.role === "superadmin")
}

/**
 * Traduce las excepciones de las RPC de movimientos a mensajes de UI.
 * Las funciones Postgres lanzan `raise exception` con textos conocidos.
 */
function mensajeError(raw: string | undefined): string {
  const msg = (raw ?? "").toLowerCase()
  if (msg.includes("stock insuficiente"))
    return "No hay stock suficiente para registrar esa salida."
  if (msg.includes("inexistente") || msg.includes("eliminado"))
    return "El producto ya no está disponible."
  if (msg.includes("lote vac")) return "Agrega al menos un producto."
  if (msg.includes("no autorizado")) return "No autorizado."
  return "No se pudo registrar el movimiento."
}

/**
 * Registra un lote multiproducto (Spec 06.1). Todos los productos (de cualquier
 * categoría) se registran en UNA transacción vía `registrar_movimientos_lote`:
 * si un item falla (sin stock, producto eliminado), cae el lote entero y no se
 * registra nada. Devuelve el id de un movimiento del lote para descargar el
 * vale consolidado.
 */
export async function registrarLote(input: unknown): Promise<LoteResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }

  const parsed = movimientoLoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const { tipo, items, area_id, motivo } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("registrar_movimientos_lote", {
    p_tipo: tipo,
    // supabase-js serializa el arreglo a jsonb; la RPC itera sobre él.
    p_items: items,
    // La RPC normaliza el área según el tipo; en salida va el área, en entrada null.
    p_area_id: tipo === "salida" ? (area_id ?? null) : null,
    p_motivo: motivo ?? null,
  })

  if (error) return { ok: false, error: mensajeError(error.message) }

  revalidatePath("/admin/movimientos")
  revalidatePath("/admin/productos")
  return { ok: true, movimientoId: data as string }
}
