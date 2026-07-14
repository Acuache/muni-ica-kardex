"use server"

import { revalidatePath } from "next/cache"

import { z } from "zod"

import { getProfile } from "@/lib/auth/profile"
import { IMAGEN } from "@/lib/catalogo/constants"
import { productoSchema, type ProductoData } from "@/lib/catalogo/schemas"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }

const RUTA = "/admin/productos"
const BUCKET = IMAGEN.bucket

/** Guard de servidor: solo admin/superadmin (defensa en profundidad sobre la RLS). */
async function esAdmin(): Promise<boolean> {
  const profile = await getProfile()
  return !!profile && (profile.role === "admin" || profile.role === "superadmin")
}

/** Fila de `productos` a partir de los datos validados. */
function toRow(d: ProductoData) {
  return {
    sku: d.sku,
    nombre: d.nombre,
    categoria_id: d.categoria_id,
    stock_actual: d.stock_actual,
    stock_minimo: d.stock_minimo,
    es_perecible: d.es_perecible,
    fecha_caducidad: d.fecha_caducidad ?? null,
    imagen_path: d.imagen_path ?? null,
  }
}

/** Traduce errores de Postgres a mensajes de UI. */
function mensajeError(code: string | undefined, fallback: string): string {
  if (code === "23505") return "Ya existe un producto con ese SKU."
  if (code === "23503") return "La categoría seleccionada no existe."
  return fallback
}

export async function crearProducto(input: unknown): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }

  const parsed = productoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase.from("productos").insert(toRow(parsed.data))

  if (error) {
    // La imagen ya se subió en el cliente; si el insert falla, límpiala.
    if (parsed.data.imagen_path)
      await supabase.storage.from(BUCKET).remove([parsed.data.imagen_path])
    return { ok: false, error: mensajeError(error.code, "No se pudo crear el producto.") }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

export async function editarProducto(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Producto inválido." }

  const parsed = productoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const supabase = await createClient()

  // Imagen anterior, para borrarla si cambió.
  const { data: actual } = await supabase
    .from("productos")
    .select("imagen_path")
    .eq("id", id)
    .single()
  const oldPath = actual?.imagen_path ?? null
  const newPath = parsed.data.imagen_path ?? null

  const { error } = await supabase
    .from("productos")
    .update(toRow(parsed.data))
    .eq("id", id)

  if (error) {
    // Si se subió una imagen nueva distinta y el update falló, límpiala.
    if (newPath && newPath !== oldPath)
      await supabase.storage.from(BUCKET).remove([newPath])
    return {
      ok: false,
      error: mensajeError(error.code, "No se pudo actualizar el producto."),
    }
  }

  // Update OK: si la imagen cambió (reemplazo o quita), borra la anterior.
  if (oldPath && oldPath !== newPath)
    await supabase.storage.from(BUCKET).remove([oldPath])

  revalidatePath(RUTA)
  return { ok: true }
}

export async function eliminarProducto(id: string): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Producto inválido." }

  const supabase = await createClient()

  const { data: actual } = await supabase
    .from("productos")
    .select("imagen_path")
    .eq("id", id)
    .single()

  const { error } = await supabase.from("productos").delete().eq("id", id)
  if (error) return { ok: false, error: "No se pudo eliminar el producto." }

  // Borra la imagen asociada, si tenía.
  if (actual?.imagen_path)
    await supabase.storage.from(BUCKET).remove([actual.imagen_path])

  revalidatePath(RUTA)
  return { ok: true }
}
