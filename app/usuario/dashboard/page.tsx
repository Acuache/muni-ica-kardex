import { getProfile } from "@/lib/auth/profile"
import type { Movimiento } from "@/lib/movimientos/types"
import { createClient } from "@/lib/supabase/server"

import { HistorialClient } from "./historial-client"

type MovimientoRow = {
  id: string
  folio: number
  lote_id: string
  tipo: "entrada" | "salida"
  producto_id: string
  cantidad: number
  area_id: string | null
  usuario_id: string | null
  motivo: string | null
  fecha: string
}

/**
 * Historial de entregas del rol usuario (Spec 08): las salidas entregadas a
 * SU área, agrupadas por lote. El guard de rol vive en `app/usuario/layout.tsx`.
 * La RLS (`movimientos_select_usuario` / `lotes_select_usuario`, Spec 08) ya
 * acota `movimientos` a las salidas del área del perfil, así que aquí no hace
 * falta filtrar por `area_id` a mano — solo resolver nombres de producto y el
 * número de lote, espejo de `app/admin/movimientos/page.tsx`. No hace falta
 * resolver área (siempre la del usuario) ni autor (la vista no lo muestra).
 */
export default async function UsuarioDashboardPage() {
  const profile = await getProfile()

  if (!profile?.area_id) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm font-medium">Sin área asignada</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu cuenta todavía no tiene un área asignada, así que no hay ningún
          historial de entregas que mostrar. Pide a un administrador que te
          asigne una.
        </p>
      </main>
    )
  }

  const supabase = await createClient()

  const [
    { data: movsRaw },
    { data: productosRaw },
    { data: lotesRaw },
    { data: areaRaw },
  ] = await Promise.all([
    supabase
      .from("movimientos")
      .select(
        "id, folio, lote_id, tipo, producto_id, cantidad, area_id, usuario_id, motivo, fecha",
      )
      .order("fecha", { ascending: false }),
    // TODOS los productos (incl. eliminados), para que el historial no
    // pierda el nombre de un producto que ya fue soft-eliminado.
    supabase.from("productos").select("id, nombre, sku"),
    // Correlativo de cada lote (Spec 06.1); se resuelve con Map, no con embed.
    supabase.from("lotes").select("id, numero"),
    // Nombre de la propia área, para el encabezado del historial.
    supabase.from("areas").select("nombre").eq("id", profile.area_id).single(),
  ])

  const movRows = (movsRaw ?? []) as MovimientoRow[]
  const productos = (productosRaw ?? []) as {
    id: string
    nombre: string
    sku: string
  }[]
  const lotes = (lotesRaw ?? []) as { id: string; numero: number }[]

  const prodPorId = new Map(productos.map((p) => [p.id, p]))
  const loteNumPorId = new Map(lotes.map((l) => [l.id, l.numero]))

  const movimientos: Movimiento[] = movRows.map((m) => {
    const prod = prodPorId.get(m.producto_id)
    return {
      id: m.id,
      folio: m.folio,
      lote_id: m.lote_id,
      lote_numero: loteNumPorId.get(m.lote_id) ?? 0,
      tipo: m.tipo,
      producto_id: m.producto_id,
      producto_nombre: prod?.nombre ?? null,
      producto_sku: prod?.sku ?? null,
      cantidad: m.cantidad,
      area_id: m.area_id,
      area_nombre: null, // siempre la propia; la vista no la muestra por fila
      usuario_id: m.usuario_id,
      usuario_email: null, // el usuario no es el autor; la vista no lo muestra
      motivo: m.motivo,
      fecha: m.fecha,
    }
  })

  const areaNombre = (areaRaw as { nombre: string } | null)?.nombre ?? "—"

  return (
    <main className="flex-1 p-6">
      <HistorialClient movimientos={movimientos} areaNombre={areaNombre} />
    </main>
  )
}
