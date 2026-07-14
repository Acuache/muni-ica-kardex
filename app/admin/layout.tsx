import type { ReactNode } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { requireRole } from "@/lib/auth/require-role"

import { logout } from "./dashboard/actions"

/**
 * Shell de admin (sidebar), bajo `/admin/…`. Para **admin y superadmin**.
 * El guard corre en servidor en cada request: sin sesión → /login, perfil
 * incompleto → /completar-perfil, rol equivocado → su propio landing.
 *
 * El sidebar muestra solo "Dashboard"; cada módulo agrega su enlace en su
 * propio spec (sin rutas muertas).
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireRole(["admin", "superadmin"])

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 flex-col border-r bg-muted/40 p-4">
        <div className="mb-6 px-2 text-sm font-semibold">Kardex · Ica</div>
        <nav className="flex flex-1 flex-col gap-1">
          <Link
            href="/admin/dashboard"
            className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            Dashboard
          </Link>
        </nav>
        <form action={logout}>
          <Button type="submit" variant="outline" className="w-full">
            Cerrar sesión
          </Button>
        </form>
      </aside>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
