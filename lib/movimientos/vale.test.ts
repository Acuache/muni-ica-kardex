import { describe, it, expect } from "vitest"

import {
  construirDatosVale,
  formatFechaVale,
  formatFolio,
  formatLote,
  nombreArchivoVale,
} from "./vale"
import type { MovimientoVale } from "./types"

/** Una fila de salida completa; cada test altera solo lo que le importa. */
const BASE: MovimientoVale = {
  folio: 42,
  lote_numero: 7,
  // 17:52 UTC = 12:52 en Lima (UTC-5, sin horario de verano).
  fecha: "2026-06-14T17:52:04.025Z",
  cantidad: 3,
  motivo: "Entrega a Logística",
  producto_nombre: "Papel bond A4",
  producto_sku: "PAP-001",
  categoria_nombre: "Oficina",
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

describe("formatLote", () => {
  it("da el código de lote con padding a 6", () => {
    expect(formatLote(42)).toBe("L-000042")
    expect(formatLote(1)).toBe("L-000001")
  })

  it("no trunca un número de lote de 7 dígitos o más", () => {
    expect(formatLote(1234567)).toBe("L-1234567")
  })
})

describe("nombreArchivoVale", () => {
  it("nombra el archivo con el código de lote", () => {
    expect(nombreArchivoVale(42)).toBe("vale-L-000042.pdf")
  })

  it("no trunca un número de lote largo", () => {
    expect(nombreArchivoVale(1234567)).toBe("vale-L-1234567.pdf")
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
  it("un lote de un producto produce un grupo con un item", () => {
    const d = construirDatosVale([BASE])
    // El documento se identifica por el código de lote, no por el folio.
    expect(d.loteTexto).toBe("L-000007")
    expect(d.fecha).toContain("14 de junio de 2026")
    expect(d.area).toBe("Logística")
    expect(d.motivo).toBe("Entrega a Logística")
    expect(d.grupos).toHaveLength(1)
    expect(d.grupos[0].categoria).toBe("Oficina")
    expect(d.grupos[0].items).toHaveLength(1)
    expect(d.grupos[0].items[0]).toEqual({
      folioTexto: "000042",
      producto: "Papel bond A4",
      sku: "PAP-001",
      cantidad: 3,
    })
  })

  it("agrupa filas de varias categorías en secciones ordenadas por nombre", () => {
    const d = construirDatosVale([
      { ...BASE, folio: 44, producto_nombre: "Lejía", producto_sku: "LI-LEJ", categoria_nombre: "Limpieza" },
      { ...BASE, folio: 42, producto_nombre: "Papel", producto_sku: "PAP-001", categoria_nombre: "Oficina" },
      { ...BASE, folio: 43, producto_nombre: "Detergente", producto_sku: "LI-DET", categoria_nombre: "Limpieza" },
    ])
    // Dos grupos, ordenados alfabéticamente: Limpieza antes que Oficina.
    expect(d.grupos.map((g) => g.categoria)).toEqual(["Limpieza", "Oficina"])
    // Dentro de Limpieza, ordenados por folio (43 antes que 44).
    expect(d.grupos[0].items.map((i) => i.folioTexto)).toEqual(["000043", "000044"])
    expect(d.grupos[1].items.map((i) => i.folioTexto)).toEqual(["000042"])
  })

  it("el encabezado usa el código de lote (mismo para todas las filas)", () => {
    const d = construirDatosVale([
      { ...BASE, folio: 47, lote_numero: 42, categoria_nombre: "Limpieza" },
      { ...BASE, folio: 42, lote_numero: 42, categoria_nombre: "Oficina" },
      { ...BASE, folio: 45, lote_numero: 42, categoria_nombre: "Dulces" },
    ])
    expect(d.loteTexto).toBe("L-000042")
  })

  it("una fila sin categoría cae en la sección «Sin categoría»", () => {
    const d = construirDatosVale([{ ...BASE, categoria_nombre: null }])
    expect(d.grupos[0].categoria).toBe("Sin categoría")
  })

  it("«Entregado por» usa el nombre cuando existe", () => {
    expect(construirDatosVale([BASE]).entregadoPor).toBe("Ana Ñuñez")
  })

  it("«Entregado por» cae al email si no hay nombre (perfil sin completar)", () => {
    const d = construirDatosVale([{ ...BASE, autor_nombre: null }])
    expect(d.entregadoPor).toBe("ana@muni-ica.gob.pe")
  })

  it("«Entregado por» cae al email si el nombre está en blanco", () => {
    const d = construirDatosVale([{ ...BASE, autor_nombre: "   " }])
    expect(d.entregadoPor).toBe("ana@muni-ica.gob.pe")
  })

  it("«Entregado por» es «—» si la cuenta fue eliminada (sin nombre ni email)", () => {
    const d = construirDatosVale([
      { ...BASE, autor_nombre: null, autor_email: null },
    ])
    expect(d.entregadoPor).toBe("—")
  })

  it("deja el motivo en null cuando el movimiento no lo trae", () => {
    expect(construirDatosVale([{ ...BASE, motivo: null }]).motivo).toBeNull()
  })

  it("trata un motivo en blanco como ausente", () => {
    expect(construirDatosVale([{ ...BASE, motivo: "   " }]).motivo).toBeNull()
  })

  it("resuelve producto, SKU y área ausentes a «—» en vez de imprimir null", () => {
    const d = construirDatosVale([
      { ...BASE, producto_nombre: null, producto_sku: null, area_nombre: null },
    ])
    expect(d.grupos[0].items[0].producto).toBe("—")
    expect(d.grupos[0].items[0].sku).toBe("—")
    expect(d.area).toBe("—")
  })
})
