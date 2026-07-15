"use server"

import { revalidatePath } from "next/cache"

import { getProfile } from "@/lib/auth/profile"
import { movimientoSchema } from "@/lib/movimientos/schemas"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }

/** Guard de servidor: solo admin/superadmin (defensa en profundidad sobre la RLS). */
async function esAdmin(): Promise<boolean> {
  const profile = await getProfile()
  return !!profile && (profile.role === "admin" || profile.role === "superadmin")
}

/**
 * Traduce las excepciones de la RPC `registrar_movimiento` a mensajes de UI.
 * La función Postgres lanza `raise exception` con textos conocidos.
 */
function mensajeError(raw: string | undefined): string {
  const msg = (raw ?? "").toLowerCase()
  if (msg.includes("stock insuficiente"))
    return "No hay stock suficiente para registrar esa salida."
  if (msg.includes("inexistente") || msg.includes("eliminado"))
    return "El producto ya no está disponible."
  if (msg.includes("no autorizado")) return "No autorizado."
  return "No se pudo registrar el movimiento."
}

/**
 * Registra un movimiento de kardex (Spec 05). Todo el ajuste de stock ocurre
 * dentro de la función transaccional `registrar_movimiento` (insert + update en
 * una sola transacción con bloqueo de fila); esta acción solo valida, invoca la
 * RPC y traduce el error de stock insuficiente a un mensaje inline.
 */
export async function registrar(input: unknown): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }

  const parsed = movimientoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const { tipo, producto_id, cantidad, area_id, motivo } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc("registrar_movimiento", {
    p_tipo: tipo,
    p_producto_id: producto_id,
    p_cantidad: cantidad,
    // La RPC normaliza el área según el tipo; en salida va el área, en entrada null.
    p_area_id: tipo === "salida" ? (area_id ?? null) : null,
    p_motivo: motivo ?? null,
  })

  if (error) return { ok: false, error: mensajeError(error.message) }

  revalidatePath("/admin/movimientos")
  revalidatePath("/admin/productos")
  return { ok: true }
}
