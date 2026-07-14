"use server"

import { revalidatePath } from "next/cache"

import { z } from "zod"

import { getProfile } from "@/lib/auth/profile"
import { categoriaSchema } from "@/lib/catalogo/schemas"
import { createClient } from "@/lib/supabase/server"

/** Resultado uniforme de las acciones del catálogo. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const RUTA = "/admin/categorias"

/** Guard de servidor: solo admin/superadmin (defensa en profundidad sobre la RLS). */
async function esAdmin(): Promise<boolean> {
  const profile = await getProfile()
  return !!profile && (profile.role === "admin" || profile.role === "superadmin")
}

export async function crearCategoria(input: unknown): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }

  const parsed = categoriaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase.from("categorias").insert({
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion ?? null,
  })

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Ya existe una categoría con ese nombre." }
    return { ok: false, error: "No se pudo crear la categoría." }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

export async function editarCategoria(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Categoría inválida." }

  const parsed = categoriaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase
    .from("categorias")
    .update({
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion ?? null,
    })
    .eq("id", id)

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Ya existe una categoría con ese nombre." }
    return { ok: false, error: "No se pudo actualizar la categoría." }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

export async function eliminarCategoria(id: string): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Categoría inválida." }

  const supabase = await createClient()
  const { error } = await supabase.from("categorias").delete().eq("id", id)

  if (error) {
    // 23503 = foreign_key_violation: hay productos que referencian la categoría.
    if (error.code === "23503")
      return {
        ok: false,
        error: "No se puede eliminar: la categoría tiene productos asociados.",
      }
    return { ok: false, error: "No se pudo eliminar la categoría." }
  }

  revalidatePath(RUTA)
  return { ok: true }
}
