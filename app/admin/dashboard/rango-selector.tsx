"use client"

import Link from "next/link"

import { RANGOS, type Rango } from "@/lib/dashboard/constants"
import { cn } from "@/lib/utils"

/**
 * Control segmentado del rango del dashboard (Spec 07): 7 / 30 / 90 días. Cambiar
 * de segmento navega a `?dias=<n>` sobre la misma ruta, lo que recarga el Server
 * Component y recalcula rankings y su KPI (las listas de estado no dependen del
 * rango). El rango activo llega como prop `valor` (ya validado en el servidor con
 * `diasRango`), así el componente no necesita `useSearchParams` ni su Suspense.
 * `scroll={false}` conserva la posición al cambiar de rango.
 */
export function RangoSelector({ valor }: { valor: Rango }) {
  return (
    <div
      role="group"
      aria-label="Rango de tiempo"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
    >
      {RANGOS.map((dias) => {
        const activo = dias === valor

        return (
          <Link
            key={dias}
            href={`?dias=${dias}`}
            scroll={false}
            aria-current={activo ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              activo
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {dias} días
          </Link>
        )
      })}
    </div>
  )
}
