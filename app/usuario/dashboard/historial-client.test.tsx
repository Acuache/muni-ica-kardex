import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Movimiento } from "@/lib/movimientos/types"

import { HistorialClient } from "./historial-client"

/** Envuelve `render` con el `areaNombre` por defecto; cada test lo pisa si le importa. */
function renderHistorial(
  movimientos: Movimiento[],
  areaNombre = "Logística",
) {
  return render(
    <HistorialClient movimientos={movimientos} areaNombre={areaNombre} />,
  )
}

/** Una salida de un solo producto en el lote L-000001; cada test altera solo lo que le importa. */
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
    cantidad: 5,
    area_id: "area-1",
    area_nombre: null,
    usuario_id: null,
    usuario_email: null,
    motivo: "Entrega mensual",
    fecha: "2026-06-14T17:52:04.025Z",
    ...overrides,
  }
}

describe("HistorialClient", () => {
  it("muestra el título y el área del usuario en el encabezado", () => {
    renderHistorial([mov({})], "Logística")

    expect(screen.getByText("Mi historial de entregas")).toBeInTheDocument()
    expect(screen.getByText("Logística")).toBeInTheDocument()
  })

  it("muestra la fila del lote colapsada por defecto", () => {
    renderHistorial([mov({})])

    expect(screen.getByText("L-000001")).toBeInTheDocument()
    expect(screen.queryByText("Papel bond A4")).not.toBeInTheDocument()
  })

  it("expande el lote al hacer click y muestra sus productos", () => {
    renderHistorial([mov({})])

    fireEvent.click(screen.getByText("L-000001"))

    expect(screen.getByText("Papel bond A4")).toBeInTheDocument()
    expect(screen.getByText("PAP-001")).toBeInTheDocument()
    expect(screen.getByText("+5")).toBeInTheDocument()
  })

  it("no muestra el motivo del movimiento (nota interna del almacén)", () => {
    renderHistorial([mov({ motivo: "Entrega mensual" })])

    fireEvent.click(screen.getByText("L-000001"))

    expect(screen.queryByText("Entrega mensual")).not.toBeInTheDocument()
    expect(screen.queryByText("Motivo")).not.toBeInTheDocument()
  })

  it("el buscador filtra por SKU inexistente y muestra el vacío", () => {
    renderHistorial([mov({})])

    fireEvent.change(screen.getByPlaceholderText(/Buscar por lote/), {
      target: { value: "NO-EXISTE" },
    })

    expect(
      screen.getByText("No hay entregas que coincidan con la búsqueda."),
    ).toBeInTheDocument()
    expect(screen.queryByText("L-000001")).not.toBeInTheDocument()
  })

  it("el buscador encuentra por SKU existente (sin distinguir mayúsculas)", () => {
    renderHistorial([mov({})])

    fireEvent.change(screen.getByPlaceholderText(/Buscar por lote/), {
      target: { value: "pap-001" },
    })

    expect(screen.getByText("L-000001")).toBeInTheDocument()
  })

  it("el buscador encuentra por código de lote", () => {
    renderHistorial([
      mov({ id: "m1", lote_id: "lote-1", lote_numero: 1 }),
      mov({
        id: "m2",
        lote_id: "lote-2",
        lote_numero: 2,
        producto_nombre: "Tóner HP",
        producto_sku: "TON-002",
      }),
    ])

    fireEvent.change(screen.getByPlaceholderText(/Buscar por lote/), {
      target: { value: "L-000002" },
    })

    expect(screen.getByText("L-000002")).toBeInTheDocument()
    expect(screen.queryByText("L-000001")).not.toBeInTheDocument()
  })

  it("muestra el estado vacío cuando no hay entregas registradas", () => {
    renderHistorial([])

    expect(
      screen.getByText("Aún no tienes entregas registradas."),
    ).toBeInTheDocument()
  })

  it("no expone ningún control de escritura ni botón de vale", () => {
    renderHistorial([mov({})])

    fireEvent.click(screen.getByText("L-000001"))

    expect(
      screen.queryByRole("button", { name: /registrar/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /vale/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /vale/i }),
    ).not.toBeInTheDocument()
  })
})
