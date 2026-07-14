"use server"

import { revalidatePath } from "next/cache"

import { z } from "zod"

import { getProfile } from "@/lib/auth/profile"
import { areaSchema } from "@/lib/usuarios/schemas"
import { createClient } from "@/lib/supabase/server"

/** Resultado uniforme de las acciones de áreas. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const RUTA = "/admin/areas"

/** Guard de servidor: solo admin/superadmin (defensa en profundidad sobre la RLS). */
async function esAdmin(): Promise<boolean> {
  const profile = await getProfile()
  return !!profile && (profile.role === "admin" || profile.role === "superadmin")
}

export async function crearArea(input: unknown): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }

  const parsed = areaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase
    .from("areas")
    .insert({ nombre: parsed.data.nombre })

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Ya existe un área con ese nombre." }
    return { ok: false, error: "No se pudo crear el área." }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

export async function editarArea(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Área inválida." }

  const parsed = areaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase
    .from("areas")
    .update({ nombre: parsed.data.nombre })
    .eq("id", id)

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Ya existe un área con ese nombre." }
    return { ok: false, error: "No se pudo actualizar el área." }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

export async function eliminarArea(id: string): Promise<ActionResult> {
  if (!(await esAdmin())) return { ok: false, error: "No autorizado." }
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Área inválida." }

  const supabase = await createClient()
  const { error } = await supabase.from("areas").delete().eq("id", id)

  if (error) {
    // 23503 = foreign_key_violation: hay perfiles que referencian el área.
    if (error.code === "23503")
      return {
        ok: false,
        error: "No se puede eliminar: el área tiene usuarios asignados.",
      }
    return { ok: false, error: "No se pudo eliminar el área." }
  }

  revalidatePath(RUTA)
  return { ok: true }
}
