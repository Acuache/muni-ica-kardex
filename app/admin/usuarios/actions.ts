"use server"

import { revalidatePath } from "next/cache"

import { getProfile, type Profile } from "@/lib/auth/profile"
import { PASSWORD_POR_DEFECTO } from "@/lib/usuarios/constants"
import { usuarioCrearSchema, usuarioEditarSchema } from "@/lib/usuarios/schemas"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/** Resultado uniforme de las acciones de usuarios. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const RUTA = "/admin/usuarios"

/**
 * Guard de servidor: devuelve el perfil del que llama solo si es admin o
 * superadmin; `null` en caso contrario. Defensa en profundidad sobre la RLS y
 * los triggers del Spec 02 (la Auth Admin API se salta la RLS).
 */
async function requireAdmin(): Promise<Profile | null> {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== "admin" && profile.role !== "superadmin") return null
  return profile
}

/** Lee el rol de la cuenta objetivo (vía sesión del admin; la RLS deja leer todo). */
async function rolObjetivo(id: string): Promise<Profile["role"] | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single()
  return (data?.role as Profile["role"]) ?? null
}

/**
 * Alta de usuario. Usa DOS clientes a propósito (mínimo privilegio):
 *   1. service role → `auth.admin.createUser` (imposible con la llave pública);
 *      el trigger del Spec 02 crea la fila en `profiles` (role='usuario').
 *   2. sesión del admin (RLS) → `update` de role/area_id/nombre/telefono, que el
 *      guard del Spec 02 permite porque `is_admin()` es true.
 */
export async function crearUsuario(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." }

  const parsed = usuarioCrearSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }
  const data = parsed.data

  // 1) Crear la cuenta en auth.users con el service role.
  const admin = createAdminClient()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: PASSWORD_POR_DEFECTO,
    email_confirm: true,
  })

  if (createErr || !created?.user) {
    const code = (createErr as { code?: string } | null)?.code
    const status = (createErr as { status?: number } | null)?.status
    const msg = createErr?.message?.toLowerCase() ?? ""
    if (
      code === "email_exists" ||
      status === 422 ||
      msg.includes("already been registered") ||
      msg.includes("already registered")
    ) {
      return { ok: false, error: "Ya existe una cuenta con ese email." }
    }
    return { ok: false, error: "No se pudo crear la cuenta." }
  }

  const nuevoId = created.user.id

  // 2) Fijar rol/área/datos con la SESIÓN del admin (no el service role): así el
  //    guard del Spec 02 permite el cambio de role/area_id (is_admin()=true).
  const perfilCompleto = !!data.nombre && !!data.telefono
  const supabase = await createClient()
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      role: data.role,
      area_id: data.area_id ?? null,
      nombre: data.nombre ?? null,
      telefono: data.telefono ?? null,
      perfil_completo: perfilCompleto,
    })
    .eq("id", nuevoId)

  if (updateErr) {
    // Rollback: la cuenta quedó a medio configurar; se elimina para no dejar
    // usuarios huérfanos con rol/área incorrectos.
    await admin.auth.admin.deleteUser(nuevoId)
    return { ok: false, error: "No se pudo configurar la cuenta." }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

/**
 * Edición de perfil (nombre, teléfono, rol, área). Se rechaza si el objetivo es
 * el superadmin o si un admin intenta degradar su propia cuenta a `usuario`.
 * El update va por la sesión del admin (RLS + guard del Spec 02).
 */
export async function editarUsuario(input: unknown): Promise<ActionResult> {
  const yo = await requireAdmin()
  if (!yo) return { ok: false, error: "No autorizado." }

  const parsed = usuarioEditarSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Datos inválidos." }
  const data = parsed.data

  const rol = await rolObjetivo(data.id)
  if (!rol) return { ok: false, error: "La cuenta no existe." }
  if (rol === "superadmin")
    return { ok: false, error: "No se puede modificar al superadmin." }

  // Autoprotección: un admin no puede degradarse a sí mismo.
  if (data.id === yo.id && data.role === "usuario")
    return { ok: false, error: "No puedes degradar tu propia cuenta." }

  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({
      role: data.role,
      area_id: data.area_id ?? null,
      nombre: data.nombre ?? null,
      telefono: data.telefono ?? null,
    })
    .eq("id", data.id)

  if (error) return { ok: false, error: "No se pudo actualizar la cuenta." }

  revalidatePath(RUTA)
  return { ok: true }
}

/** Resetea la contraseña de una cuenta al valor por defecto (service role). */
export async function resetearPassword(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." }

  const rol = await rolObjetivo(id)
  if (!rol) return { ok: false, error: "La cuenta no existe." }
  if (rol === "superadmin")
    return { ok: false, error: "No se puede resetear al superadmin." }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(id, {
    password: PASSWORD_POR_DEFECTO,
  })

  if (error) return { ok: false, error: "No se pudo resetear la contraseña." }
  return { ok: true }
}

/**
 * Elimina una cuenta (service role → `deleteUser`); su fila en `profiles` se va
 * por `on delete cascade`. Se rechaza si el objetivo es el superadmin o es uno
 * mismo. Los triggers del Spec 02 son la última barrera (el service role no los
 * salta): el `deleteUser` del superadmin aborta por la excepción del trigger.
 */
export async function eliminarUsuario(id: string): Promise<ActionResult> {
  const yo = await requireAdmin()
  if (!yo) return { ok: false, error: "No autorizado." }

  if (id === yo.id)
    return { ok: false, error: "No puedes eliminar tu propia cuenta." }

  const rol = await rolObjetivo(id)
  if (!rol) return { ok: false, error: "La cuenta no existe." }
  if (rol === "superadmin")
    return { ok: false, error: "No se puede eliminar al superadmin." }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)

  if (error) return { ok: false, error: "No se pudo eliminar la cuenta." }

  revalidatePath(RUTA)
  return { ok: true }
}
