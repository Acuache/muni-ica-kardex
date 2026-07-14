"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { resolveLanding } from "@/lib/auth/landing"
import { getProfile } from "@/lib/auth/profile"
import { createClient } from "@/lib/supabase/server"

export type OnboardingState = { error: string | null }

/**
 * Server Action del onboarding. Guarda nombre y teléfono en la propia fila,
 * marca `perfil_completo=true` (permitido por la policy `profiles_update_own`;
 * el trigger `guard_profile_write` impide que se cuele un cambio de rol/área) y
 * redirige al landing del rol. Devuelve `{ error }` a la página si falla.
 */
export async function completarPerfil(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const nombre = String(formData.get("nombre") ?? "").trim()
  const telefono = String(formData.get("telefono") ?? "").trim()

  if (!nombre || !telefono) {
    return { error: "Completa tu nombre y teléfono." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { error } = await supabase
    .from("profiles")
    .update({ nombre, telefono, perfil_completo: true })
    .eq("id", user.id)

  if (error) {
    return { error: "No se pudo guardar tu perfil. Inténtalo de nuevo." }
  }

  revalidatePath("/", "layout")

  // Releer el perfil ya actualizado para enrutar por rol.
  const profile = await getProfile()
  redirect(profile ? resolveLanding(profile) : "/")
}
