import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/**
 * Raíz de la app. No hay landing público: redirige a `/dashboard` si hay
 * sesión y a `/login` si no.
 */
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? "/dashboard" : "/login")
}
