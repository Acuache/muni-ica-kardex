"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { resolveLanding } from "@/lib/auth/landing"
import { getProfile } from "@/lib/auth/profile"
import { createClient } from "@/lib/supabase/server"

export type LoginState = { error: string | null }

/**
 * Server Action de login. Devuelve `{ error }` a la página cuando fallan las
 * credenciales; en éxito refresca el cache y redirige al landing del rol
 * (`/completar-perfil` si el perfil está incompleto).
 * (El `redirect` lanza internamente, por eso va fuera de cualquier try/catch.)
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const message =
      error.status === 429
        ? "Demasiados intentos. Inténtalo de nuevo en unos minutos."
        : "Correo o contraseña incorrectos."
    return { error: message }
  }

  revalidatePath("/", "layout")

  const profile = await getProfile()
  redirect(profile ? resolveLanding(profile) : "/")
}
