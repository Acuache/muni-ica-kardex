import { describe, expect, it } from "vitest"

import { categoriaSchema, productoSchema } from "./schemas"

describe("categoriaSchema", () => {
  it("acepta una categoría válida", () => {
    const r = categoriaSchema.safeParse({ nombre: "Papelería" })
    expect(r.success).toBe(true)
  })

  it("rechaza nombre vacío", () => {
    const r = categoriaSchema.safeParse({ nombre: "   " })
    expect(r.success).toBe(false)
  })

  it("normaliza descripción vacía a undefined", () => {
    const r = categoriaSchema.parse({ nombre: "X", descripcion: "  " })
    expect(r.descripcion).toBeUndefined()
  })
})

describe("productoSchema", () => {
  const base = {
    sku: "OF-LAP-AZ",
    nombre: "Lapicero azul",
    categoria_id: "00000000-0000-0000-0000-000000000000",
    stock_actual: 10,
    stock_minimo: 2,
    es_perecible: false,
  }

  it("acepta un producto no perecible válido", () => {
    const r = productoSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it("acepta un perecible CON fecha", () => {
    const r = productoSchema.safeParse({
      ...base,
      es_perecible: true,
      fecha_caducidad: "2026-12-31",
    })
    expect(r.success).toBe(true)
  })

  it("acepta un perecible SIN fecha (fecha opcional)", () => {
    const r = productoSchema.safeParse({ ...base, es_perecible: true })
    expect(r.success).toBe(true)
  })

  it("rechaza un NO perecible con fecha", () => {
    const r = productoSchema.safeParse({
      ...base,
      es_perecible: false,
      fecha_caducidad: "2026-12-31",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza SKU vacío", () => {
    const r = productoSchema.safeParse({ ...base, sku: "  " })
    expect(r.success).toBe(false)
  })

  it("rechaza categoria_id que no es uuid", () => {
    const r = productoSchema.safeParse({ ...base, categoria_id: "abc" })
    expect(r.success).toBe(false)
  })

  it("rechaza stock negativo", () => {
    const r = productoSchema.safeParse({ ...base, stock_actual: -1 })
    expect(r.success).toBe(false)
  })

  it("coacciona strings numéricos del formulario", () => {
    const r = productoSchema.safeParse({
      ...base,
      stock_actual: "20",
      stock_minimo: "5",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.stock_actual).toBe(20)
      expect(r.data.stock_minimo).toBe(5)
    }
  })

  it("normaliza fecha vacía a undefined en no perecible", () => {
    const r = productoSchema.safeParse({ ...base, fecha_caducidad: "" })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.fecha_caducidad).toBeUndefined()
  })
})
