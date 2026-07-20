import { describe, it, expect } from "vitest"

import { agruparEnLotes } from "./agrupar"
import type { Movimiento } from "./types"

/** Una fila de salida completa; cada test altera solo lo que le importa. */
function mov(overrides: Partial<Movimiento>): Movimiento {
  return {
    id: "mov-1",
    folio: 1,
    lote_id: "lote-1",
    lote_numero: 1,
    tipo: "salida",
    producto_id: "prod-1",
    producto_nombre: "Papel bond A4",
    producto_sku: "PAP-001",
    cantidad: 3,
    area_id: "area-1",
    area_nombre: "Logística",
    usuario_id: "user-1",
    usuario_email: "ana@muni-ica.gob.pe",
    motivo: "Entrega",
    fecha: "2026-06-14T17:52:04.025Z",
    ...overrides,
  }
}

describe("agruparEnLotes", () => {
  it("agrupa movimientos del mismo lote en una sola fila", () => {
    const movs = [
      mov({ id: "m1", lote_id: "lote-1", producto_id: "p1" }),
      mov({ id: "m2", lote_id: "lote-1", producto_id: "p2" }),
    ]
    const lotes = agruparEnLotes(movs)
    expect(lotes).toHaveLength(1)
    expect(lotes[0].movimientos.map((m) => m.id)).toEqual(["m1", "m2"])
  })

  it("separa movimientos de lotes distintos en filas distintas", () => {
    const movs = [
      mov({ id: "m1", lote_id: "lote-1" }),
      mov({ id: "m2", lote_id: "lote-2", lote_numero: 2 }),
    ]
    const lotes = agruparEnLotes(movs)
    expect(lotes).toHaveLength(2)
    expect(lotes.map((l) => l.id)).toEqual(["lote-1", "lote-2"])
  })

  it("deriva tipo, área, fecha y usuario del primer movimiento del lote", () => {
    const movs = [
      mov({
        id: "m1",
        lote_id: "lote-1",
        lote_numero: 7,
        tipo: "salida",
        area_id: "area-1",
        area_nombre: "Logística",
        fecha: "2026-06-14T17:52:04.025Z",
        usuario_email: "ana@muni-ica.gob.pe",
      }),
      mov({ id: "m2", lote_id: "lote-1" }),
    ]
    const [lote] = agruparEnLotes(movs)
    expect(lote).toMatchObject({
      id: "lote-1",
      numero: 7,
      tipo: "salida",
      area_id: "area-1",
      area_nombre: "Logística",
      fecha: "2026-06-14T17:52:04.025Z",
      usuario_email: "ana@muni-ica.gob.pe",
    })
  })

  it("cuenta el número de productos del lote como movimientos.length", () => {
    const movs = [
      mov({ id: "m1", lote_id: "lote-1" }),
      mov({ id: "m2", lote_id: "lote-1" }),
      mov({ id: "m3", lote_id: "lote-1" }),
    ]
    const [lote] = agruparEnLotes(movs)
    expect(lote.movimientos).toHaveLength(3)
  })

  it("devuelve un arreglo vacío si no hay movimientos", () => {
    expect(agruparEnLotes([])).toEqual([])
  })

  it("conserva el orden de primera aparición de cada lote", () => {
    const movs = [
      mov({ id: "m1", lote_id: "lote-2", lote_numero: 2 }),
      mov({ id: "m2", lote_id: "lote-1", lote_numero: 1 }),
      mov({ id: "m3", lote_id: "lote-2", lote_numero: 2 }),
    ]
    const lotes = agruparEnLotes(movs)
    expect(lotes.map((l) => l.id)).toEqual(["lote-2", "lote-1"])
  })
})
