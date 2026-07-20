/**
 * Agrupación de movimientos en lotes para la vista general (Spec 06.1),
 * extraída de `movimientos-client.tsx` para que admin (Spec 06.1) y usuario
 * (Spec 08) compartan una sola fuente testeable.
 */
import type { LoteVista, Movimiento } from "./types"

/**
 * Agrupa movimientos por `lote_id`, derivando los atributos comunes del lote
 * (tipo/área/fecha/usuario) de su primer movimiento — todos los movimientos
 * de un mismo lote los comparten por registrarse juntos (Spec 06.1). Conserva
 * el orden de aparición de cada lote (el primer movimiento visto lo abre) y,
 * dentro de él, el orden de los movimientos tal como llegan.
 */
export function agruparEnLotes(movs: Movimiento[]): LoteVista[] {
  const byLote = new Map<string, LoteVista>()
  for (const m of movs) {
    const l = byLote.get(m.lote_id)
    if (l) l.movimientos.push(m)
    else
      byLote.set(m.lote_id, {
        id: m.lote_id,
        numero: m.lote_numero,
        tipo: m.tipo,
        area_id: m.area_id,
        area_nombre: m.area_nombre,
        fecha: m.fecha,
        usuario_email: m.usuario_email,
        movimientos: [m],
      })
  }
  return [...byLote.values()]
}
