import { describe, it, expect } from "vitest"

import { movimientoSchema } from "./schemas"

const PROD = "0bf1f762-add3-4286-82c4-f7be9d859f75"
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
