import { describe, it, expect } from "vitest"

import { RANGO_DEFAULT } from "./constants"
import { diasRango, estaVencido, menosPedidos, totalSalidas } from "./dashboard"
import type { FilaPedido } from "./types"

/** Fábrica mínima de filas de pedido para las pruebas. */
function fila(nombre: string, total: number): FilaPedido {
  return {
    producto_id: nombre,
    sku: nombre,
    nombre,
    categoria_nombre: null,
    total_unidades: total,
  }
}

// Ordenadas DESC como las devuelve la RPC dashboard_pedidos.
const PEDIDOS: FilaPedido[] = [
  fila("A", 100),
  fila("B", 50),
  fila("C", 30),
  fila("D", 5),
]

describe("menosPedidos", () => {
  it("invierte (ASC) y corta a n: primero el que menos salió", () => {
    const r = menosPedidos(PEDIDOS, 2)
    expect(r.map((f) => f.nombre)).toEqual(["D", "C"])
  })

  it("no muta la entrada", () => {
    const copia = [...PEDIDOS]
    menosPedidos(PEDIDOS, 2)
    expect(PEDIDOS).toEqual(copia)
  })

  it("con menos de 2n filas no repite filas dentro del resultado", () => {
    const r = menosPedidos(PEDIDOS, 10) // n=10 > 4 filas
    const ids = r.map((f) => f.producto_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(r.map((f) => f.nombre)).toEqual(["D", "C", "B", "A"])
  })
})

describe("totalSalidas", () => {
  it("suma las unidades de todas las filas", () => {
    expect(totalSalidas(PEDIDOS)).toBe(185)
  })

  it("es 0 sin filas", () => {
    expect(totalSalidas([])).toBe(0)
  })
})

describe("estaVencido", () => {
  const hoy = new Date("2026-07-16T00:00:00.000Z")

  it("es true para ayer", () => {
    expect(estaVencido("2026-07-15", hoy)).toBe(true)
  })

  it("es false para hoy (caduca hoy no es vencido)", () => {
    expect(estaVencido("2026-07-16", hoy)).toBe(false)
  })

  it("es false para mañana", () => {
    expect(estaVencido("2026-07-17", hoy)).toBe(false)
  })
})

describe("diasRango", () => {
  it("acepta los rangos válidos", () => {
    expect(diasRango("7")).toBe(7)
    expect(diasRango("30")).toBe(30)
    expect(diasRango("90")).toBe(90)
  })

  it("cae al default con un valor fuera de rango", () => {
    expect(diasRango("45")).toBe(RANGO_DEFAULT)
  })

  it("cae al default con ausente o no numérico", () => {
    expect(diasRango(undefined)).toBe(RANGO_DEFAULT)
    expect(diasRango("abc")).toBe(RANGO_DEFAULT)
  })

  it("toma el primero si viene como arreglo (forma de Next)", () => {
    expect(diasRango(["7", "90"])).toBe(7)
  })
})
