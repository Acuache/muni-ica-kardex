import { redirect } from "next/navigation"

import { resolveLanding } from "@/lib/auth/landing"
import { getProfile } from "@/lib/auth/profile"

/**
 * Raíz de la app. No hay landing público: sin sesión → `/login`; con sesión,
 * enruta por rol/perfil con `resolveLanding` (admin/superadmin → /admin,
 * usuario → /usuario, perfil incompleto → /completar-perfil).
 */
export default async function Home() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  redirect(resolveLanding(profile))
}
