import { describe, it, expect } from "vitest"

import {
  crearLoteFormSchema,
  movimientoLoteSchema,
  movimientoSchema,
} from "./schemas"

const PROD = "0bf1f762-add3-4286-82c4-f7be9d859f75"
const PROD2 = "1c2d3e4f-5678-4abc-9def-0123456789ab"
const PROD3 = "2d3e4f56-7890-4bcd-8ef0-123456789abc"
const AREA = "fae3b17f-3cca-448f-b9ee-5710144555d2"

describe("movimientoSchema", () => {
  it("acepta una entrada válida sin área", () => {
    const r = movimientoSchema.safeParse({
      tipo: "entrada",
      producto_id: PROD,
      cantidad: 10,
    })
    expect(r.success).toBe(true)
  })

  it("acepta una salida válida con área y motivo", () => {
    const r = movimientoSchema.safeParse({
      tipo: "salida",
      producto_id: PROD,
      cantidad: 3,
      area_id: AREA,
      motivo: "Entrega a Logística",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.area_id).toBe(AREA)
  })

  it("rechaza una salida sin área destino", () => {
    const r = movimientoSchema.safeParse({
      tipo: "salida",
      producto_id: PROD,
      cantidad: 3,
    })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "area_id")).toBe(true)
  })

  it("rechaza una entrada con área", () => {
    const r = movimientoSchema.safeParse({
      tipo: "entrada",
      producto_id: PROD,
      cantidad: 3,
      area_id: AREA,
    })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "area_id")).toBe(true)
  })

  it("rechaza cantidad 0", () => {
    const r = movimientoSchema.safeParse({
      tipo: "entrada",
      producto_id: PROD,
      cantidad: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rechaza cantidad negativa", () => {
    const r = movimientoSchema.safeParse({
      tipo: "entrada",
      producto_id: PROD,
      cantidad: -5,
    })
    expect(r.success).toBe(false)
  })

  it("rechaza cantidad no entera", () => {
    const r = movimientoSchema.safeParse({
      tipo: "entrada",
      producto_id: PROD,
      cantidad: 2.5,
    })
    expect(r.success).toBe(false)
  })

  it("rechaza un producto_id que no es uuid", () => {
    const r = movimientoSchema.safeParse({
      tipo: "entrada",
      producto_id: "no-es-uuid",
      cantidad: 1,
    })
    expect(r.success).toBe(false)
  })

  it('normaliza area_id "" a undefined en una entrada', () => {
    const r = movimientoSchema.safeParse({
      tipo: "entrada",
      producto_id: PROD,
      cantidad: 1,
      area_id: "",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.area_id).toBeUndefined()
  })
})

describe("movimientoLoteSchema", () => {
  it("acepta una entrada con productos de varias categorías", () => {
    // La categoría no entra en el esquema; mezclar es válido.
    const r = movimientoLoteSchema.safeParse({
      tipo: "entrada",
      items: [
        { producto_id: PROD, cantidad: 2 },
        { producto_id: PROD2, cantidad: 3 },
        { producto_id: PROD3, cantidad: 5 },
      ],
    })
    expect(r.success).toBe(true)
  })

  it("acepta una salida con área y varios items", () => {
    const r = movimientoLoteSchema.safeParse({
      tipo: "salida",
      items: [
        { producto_id: PROD, cantidad: 1 },
        { producto_id: PROD2, cantidad: 2 },
      ],
      area_id: AREA,
      motivo: "Entrega mixta",
    })
    expect(r.success).toBe(true)
  })

  it("rechaza un lote vacío", () => {
    const r = movimientoLoteSchema.safeParse({ tipo: "entrada", items: [] })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "items")).toBe(true)
  })

  it("rechaza un producto repetido en el lote", () => {
    const r = movimientoLoteSchema.safeParse({
      tipo: "entrada",
      items: [
        { producto_id: PROD, cantidad: 2 },
        { producto_id: PROD, cantidad: 3 },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "items")).toBe(true)
  })

  it("rechaza una salida sin área", () => {
    const r = movimientoLoteSchema.safeParse({
      tipo: "salida",
      items: [{ producto_id: PROD, cantidad: 1 }],
    })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "area_id")).toBe(true)
  })

  it("rechaza una entrada con área", () => {
    const r = movimientoLoteSchema.safeParse({
      tipo: "entrada",
      items: [{ producto_id: PROD, cantidad: 1 }],
      area_id: AREA,
    })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "area_id")).toBe(true)
  })

  it("rechaza un item con cantidad 0 o negativa", () => {
    expect(
      movimientoLoteSchema.safeParse({
        tipo: "entrada",
        items: [{ producto_id: PROD, cantidad: 0 }],
      }).success,
    ).toBe(false)
    expect(
      movimientoLoteSchema.safeParse({
        tipo: "entrada",
        items: [{ producto_id: PROD, cantidad: -3 }],
      }).success,
    ).toBe(false)
  })
})

describe("crearLoteFormSchema (techo de stock)", () => {
  const stock = new Map([
    [PROD, 10],
    [PROD2, 4],
  ])

  it("rechaza una salida cuya cantidad supera el stock, en el item exacto", () => {
    const schema = crearLoteFormSchema(stock)
    const r = schema.safeParse({
      tipo: "salida",
      items: [
        { producto_id: PROD, cantidad: 3 }, // ok (≤10)
        { producto_id: PROD2, cantidad: 5 }, // excede (>4)
      ],
      area_id: AREA,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      // El issue apunta a la cantidad del segundo item.
      const issue = r.error.issues.find(
        (i) => i.path[0] === "items" && i.path[1] === 1 && i.path[2] === "cantidad",
      )
      expect(issue).toBeDefined()
      expect(issue?.message).toContain("Solo hay 4")
    }
  })

  it("acepta una salida cuando ninguna cantidad supera el stock", () => {
    const schema = crearLoteFormSchema(stock)
    const r = schema.safeParse({
      tipo: "salida",
      items: [
        { producto_id: PROD, cantidad: 10 },
        { producto_id: PROD2, cantidad: 4 },
      ],
      area_id: AREA,
    })
    expect(r.success).toBe(true)
  })

  it("NO aplica techo de stock en una entrada (una entrada suma)", () => {
    const schema = crearLoteFormSchema(stock)
    const r = schema.safeParse({
      tipo: "entrada",
      items: [{ producto_id: PROD2, cantidad: 9999 }],
    })
    expect(r.success).toBe(true)
  })
})
