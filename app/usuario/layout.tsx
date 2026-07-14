import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { requireRole } from "@/lib/auth/require-role"

import { logout } from "./dashboard/actions"

/**
 * Shell mínimo de usuario, bajo `/usuario/…`. Solo para el rol `usuario`
 * (el usuario ve su historial, de solo lectura). Guard de rol en servidor en
 * cada request, igual que el shell admin.
 */
export default async function UsuarioLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireRole(["usuario"])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <span className="text-sm font-semibold">Kardex · Ica</span>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Cerrar sesión
          </Button>
        </form>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
