"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/**
 * Server Action de logout del shell usuario. Cierra la sesión de Supabase,
 * refresca el cache y redirige a `/login`.
 */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath("/", "layout")
  redirect("/login")
}
