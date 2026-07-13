"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/**
 * Server Action de logout. Cierra la sesión de Supabase, refresca el cache y
 * redirige a `/login`. El `redirect` lanza internamente (fuera de try/catch).
 */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath("/", "layout")
  redirect("/login")
}
