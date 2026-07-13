import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

import { logout } from "./actions"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defensa en profundidad: además del guard de `proxy.ts`, cada página privada
  // revalida contra Supabase con `getUser()` en el servidor.
  if (!user) {
    redirect("/login")
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        Sesión iniciada como{" "}
        <span className="font-medium text-foreground">{user.email}</span>
      </p>
      <form action={logout}>
        <Button type="submit" variant="outline">
          Cerrar sesión
        </Button>
      </form>
    </main>
  )
}
