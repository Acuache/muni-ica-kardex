"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * Enlaces del sidebar admin. Cada módulo agrega el suyo aquí en su propio spec
 * (sin rutas muertas).
 */
const ENLACES = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/movimientos", label: "Movimientos" },
  { href: "/admin/areas", label: "Áreas" },
  { href: "/admin/usuarios", label: "Usuarios" },
] as const

/**
 * Navegación del shell admin. Es un Client Component porque `usePathname` solo
 * existe en cliente: el layout es un Server Component (corre el guard de rol) y
 * no puede leer la URL.
 *
 * El enlace de la sección actual se marca con fondo lleno y `aria-current`, de
 * modo que la ruta activa se distinga tanto visualmente como para lectores de
 * pantalla. Las subrutas (p. ej. `/admin/productos/nuevo`) mantienen activo el
 * enlace de su sección.
 */
export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {ENLACES.map(({ href, label }) => {
        const activo = pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm transition-colors",
              activo
                ? "bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
