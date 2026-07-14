import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { resolveLanding } from "@/lib/auth/landing"
import { getProfile } from "@/lib/auth/profile"

import { CompletarPerfilForm } from "./completar-perfil-form"

/**
 * Onboarding de primer inicio. Aplica a cualquier rol con `perfil_completo=false`.
 * Si no hay sesión → login; si el perfil YA está completo, no hay nada que
 * completar → al shell del rol.
 */
export default async function CompletarPerfilPage() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }
  if (profile.perfil_completo) {
    redirect(resolveLanding(profile))
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Completa tu perfil</CardTitle>
          <CardDescription>
            Necesitamos tu nombre y teléfono para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompletarPerfilForm
            defaultNombre={profile.nombre ?? undefined}
            defaultTelefono={profile.telefono ?? undefined}
          />
        </CardContent>
      </Card>
    </main>
  )
}
