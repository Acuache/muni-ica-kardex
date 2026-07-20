"use client"

import { Fragment, useMemo, useState } from "react"

import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react"

import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { agruparEnLotes } from "@/lib/movimientos/agrupar"
import type { Movimiento } from "@/lib/movimientos/types"
import { formatLote, padFolio } from "@/lib/movimientos/vale"

const dtf = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "short",
  timeStyle: "short",
})

function fmtFecha(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : dtf.format(d)
}

/**
 * Historial de entregas del usuario (Spec 08): tabla de lotes con filas
 * expandibles, de solo lectura — espejo de la vista admin
 * (`app/admin/movimientos/movimientos-client.tsx`) sin el botón de vale, sin
 * columnas de área/autor (todo es su área) ni `TipoBadge` (todo son salidas).
 */
export function HistorialClient({
  movimientos,
  areaNombre,
}: {
  movimientos: Movimiento[]
  areaNombre: string
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  function toggleLote(id: string) {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [q, setQ] = useState("")

  // `movimientos` ya llega ordenado por fecha descendente desde el servidor,
  // así que el primer movimiento visto de cada lote fija el orden de los lotes;
  // no hace falta un toggle de orden (buscador simple, Spec 08).
  const lotes = useMemo(() => agruparEnLotes(movimientos), [movimientos])

  const lotesVisibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return lotes
    return lotes.filter(
      (l) =>
        formatLote(l.numero).toLowerCase().includes(term) ||
        l.movimientos.some(
          (m) =>
            (m.producto_nombre ?? "").toLowerCase().includes(term) ||
            (m.producto_sku ?? "").toLowerCase().includes(term),
        ),
    )
  }, [lotes, q])

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Mi historial de entregas</h1>
        <p className="text-sm text-muted-foreground">
          Área: <span className="font-medium text-foreground">{areaNombre}</span>
          {" · "}
          {lotesVisibles.length} de {lotes.length} lote
          {lotes.length === 1 ? "" : "s"}
        </p>
      </header>

      {lotes.length > 0 && (
        <Input
          placeholder="Buscar por lote (L-…), producto o SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
      )}

      <div className="rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Lote</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Productos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotesVisibles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  {lotes.length === 0
                    ? "Aún no tienes entregas registradas."
                    : "No hay entregas que coincidan con la búsqueda."}
                </TableCell>
              </TableRow>
            ) : (
              lotesVisibles.map((lote) => {
                const abierto = abiertos.has(lote.id)
                return (
                  <Fragment key={lote.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleLote(lote.id)}
                    >
                      <TableCell className="text-muted-foreground">
                        {abierto ? (
                          <RiArrowDownSLine className="size-4" />
                        ) : (
                          <RiArrowRightSLine className="size-4" />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium tabular-nums">
                        {formatLote(lote.numero)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {fmtFecha(lote.fecha)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {lote.movimientos.length}
                      </TableCell>
                    </TableRow>
                    {abierto && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="bg-muted/30 p-0">
                          <div className="px-4 py-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Productos del lote
                            </p>
                            <div className="overflow-hidden rounded-md border bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Folio</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead className="text-right">
                                      Cantidad recibida
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {lote.movimientos.map((m) => (
                                    <TableRow key={m.id}>
                                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                                        {padFolio(m.folio)}
                                      </TableCell>
                                      <TableCell>
                                        <div className="font-medium">
                                          {m.producto_nombre ?? "—"}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {m.producto_sku ?? ""}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                        +{m.cantidad}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
