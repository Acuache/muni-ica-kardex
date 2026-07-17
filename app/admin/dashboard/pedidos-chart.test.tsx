import { describe, it, expect, beforeAll } from "vitest"
import { render } from "@testing-library/react"

import type { FilaPedido } from "@/lib/dashboard/types"

import { PedidosChart } from "./pedidos-chart"

// Recharts (vía el ResponsiveContainer del ChartContainer de shadcn) usa
// ResizeObserver, que jsdom no implementa. Se stubbea para que el render no
// lance en el entorno de test.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const DATOS: FilaPedido[] = [
  { producto_id: "1", sku: "A-1", nombre: "Lapicero azul", categoria_nombre: "Útiles", total_unidades: 50 },
  { producto_id: "2", sku: "A-2", nombre: "Hojas bond A4", categoria_nombre: "Papelería", total_unidades: 30 },
]

describe("PedidosChart", () => {
  it("renderiza con datos de ejemplo sin lanzar", () => {
    expect(() => render(<PedidosChart datos={DATOS} />)).not.toThrow()
  })

  it("renderiza también con datos vacíos sin lanzar", () => {
    expect(() => render(<PedidosChart datos={[]} />)).not.toThrow()
  })
})
