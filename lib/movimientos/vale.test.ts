import { describe, it, expect } from "vitest"

import {
  construirDatosVale,
  formatFechaVale,
  formatFolio,
  nombreArchivoVale,
} from "./vale"
import type { MovimientoVale } from "./types"

/** Movimiento de salida completo; cada test altera solo lo que le importa. */
const BASE: MovimientoVale = {
  folio: 42,
  // 17:52 UTC = 12:52 en Lima (UTC-5, sin horario de verano).
  fecha: "2026-06-14T17:52:04.025Z",
  cantidad: 3,
  motivo: "Entrega a Logística",
  producto_nombre: "Papel bond A4",
  producto_sku: "PAP-001",
  area_nombre: "Logística",
  autor_nombre: "Ana Ñuñez",
  autor_email: "ana@muni-ica.gob.pe",
}

describe("formatFolio", () => {
  it("rellena el folio a 6 dígitos", () => {
    expect(formatFolio(42)).toBe("VALE N° 000042")
  })

  it("rellena también el folio 1", () => {
    expect(formatFolio(1)).toBe("VALE N° 000001")
  })

  it("no trunca un folio de 7 dígitos o más", () => {
    expect(formatFolio(1234567)).toBe("VALE N° 1234567")
    expect(formatFolio(999999)).toBe("VALE N° 999999")
  })
})

describe("nombreArchivoVale", () => {
  it("nombra el archivo con el folio rellenado a 6", () => {
    expect(nombreArchivoVale(42)).toBe("vale-000042.pdf")
  })

  it("no trunca un folio largo", () => {
    expect(nombreArchivoVale(1234567)).toBe("vale-1234567.pdf")
  })
})

describe("formatFechaVale", () => {
  it("formatea en America/Lima, no en UTC ni en la zona del servidor", () => {
    const fecha = formatFechaVale("2026-06-14T17:52:04.025Z")
    expect(fecha).toContain("14 de junio de 2026")
    expect(fecha).toContain("12:52") // 17:52 UTC − 5h
  })

  it("desplaza el día cuando la hora UTC cae de madrugada", () => {
    // 02:30 UTC del día 15 son las 21:30 del día 14 en Lima.
    const fecha = formatFechaVale("2026-06-15T02:30:00.000Z")
    expect(fecha).toContain("14 de junio de 2026")
    expect(fecha).toContain("9:30")
  })

  it("devuelve la cadena original si la fecha es inválida", () => {
    expect(formatFechaVale("no-es-fecha")).toBe("no-es-fecha")
  })
})

describe("construirDatosVale", () => {
  it("arma el vale con el folio, la fecha en Lima y los datos del movimiento", () => {
    const d = construirDatosVale(BASE)
    expect(d.folioTexto).toBe("VALE N° 000042")
    expect(d.fecha).toContain("14 de junio de 2026")
    expect(d.producto).toBe("Papel bond A4")
    expect(d.sku).toBe("PAP-001")
    expect(d.cantidad).toBe(3)
    expect(d.area).toBe("Logística")
    expect(d.motivo).toBe("Entrega a Logística")
  })

  it("«Entregado por» usa el nombre cuando existe", () => {
    expect(construirDatosVale(BASE).entregadoPor).toBe("Ana Ñuñez")
  })

  it("«Entregado por» cae al email si no hay nombre (perfil sin completar)", () => {
    const d = construirDatosVale({ ...BASE, autor_nombre: null })
    expect(d.entregadoPor).toBe("ana@muni-ica.gob.pe")
  })

  it("«Entregado por» cae al email si el nombre está en blanco", () => {
    const d = construirDatosVale({ ...BASE, autor_nombre: "   " })
    expect(d.entregadoPor).toBe("ana@muni-ica.gob.pe")
  })

  it("«Entregado por» es «—» si la cuenta fue eliminada (sin nombre ni email)", () => {
    const d = construirDatosVale({
      ...BASE,
      autor_nombre: null,
      autor_email: null,
    })
    expect(d.entregadoPor).toBe("—")
  })

  it("deja el motivo en null cuando el movimiento no lo trae", () => {
    expect(construirDatosVale({ ...BASE, motivo: null }).motivo).toBeNull()
  })

  it("trata un motivo en blanco como ausente", () => {
    expect(construirDatosVale({ ...BASE, motivo: "   " }).motivo).toBeNull()
  })

  it("resuelve producto, SKU y área ausentes a «—» en vez de imprimir null", () => {
    const d = construirDatosVale({
      ...BASE,
      producto_nombre: null,
      producto_sku: null,
      area_nombre: null,
    })
    expect(d.producto).toBe("—")
    expect(d.sku).toBe("—")
    expect(d.area).toBe("—")
  })
})
