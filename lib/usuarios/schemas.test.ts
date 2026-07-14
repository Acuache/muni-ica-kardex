import { describe, expect, it } from "vitest"

import { areaSchema, usuarioCrearSchema, usuarioEditarSchema } from "./schemas"

const UUID = "00000000-0000-0000-0000-000000000000"

describe("areaSchema", () => {
  it("acepta un área con nombre", () => {
    expect(areaSchema.safeParse({ nombre: "Logística" }).success).toBe(true)
  })

  it("rechaza nombre vacío", () => {
    expect(areaSchema.safeParse({ nombre: "   " }).success).toBe(false)
  })
})

describe("usuarioCrearSchema", () => {
  it("acepta un admin sin área", () => {
    const r = usuarioCrearSchema.safeParse({
      email: "admin@muni.gob.pe",
      role: "admin",
    })
    expect(r.success).toBe(true)
  })

  it("acepta un usuario CON área", () => {
    const r = usuarioCrearSchema.safeParse({
      email: "user@muni.gob.pe",
      role: "usuario",
      area_id: UUID,
    })
    expect(r.success).toBe(true)
  })

  it("rechaza un usuario SIN área", () => {
    const r = usuarioCrearSchema.safeParse({
      email: "user@muni.gob.pe",
      role: "usuario",
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "area_id")).toBe(true)
    }
  })

  it("rechaza email inválido", () => {
    const r = usuarioCrearSchema.safeParse({ email: "no-es-email", role: "admin" })
    expect(r.success).toBe(false)
  })

  it("rechaza rol 'superadmin' (no es opción)", () => {
    const r = usuarioCrearSchema.safeParse({
      email: "x@muni.gob.pe",
      role: "superadmin",
    })
    expect(r.success).toBe(false)
  })

  it("normaliza email (trim + minúsculas)", () => {
    const r = usuarioCrearSchema.parse({
      email: "  Admin@Muni.Gob.PE  ",
      role: "admin",
    })
    expect(r.email).toBe("admin@muni.gob.pe")
  })

  it("normaliza nombre/teléfono/área vacíos a undefined", () => {
    const r = usuarioCrearSchema.parse({
      email: "a@b.com",
      role: "admin",
      nombre: "  ",
      telefono: "",
      area_id: "",
    })
    expect(r.nombre).toBeUndefined()
    expect(r.telefono).toBeUndefined()
    expect(r.area_id).toBeUndefined()
  })
})

describe("usuarioEditarSchema", () => {
  it("acepta edición válida de un admin sin área", () => {
    const r = usuarioEditarSchema.safeParse({ id: UUID, role: "admin" })
    expect(r.success).toBe(true)
  })

  it("acepta edición de un usuario con área", () => {
    const r = usuarioEditarSchema.safeParse({
      id: UUID,
      role: "usuario",
      area_id: UUID,
    })
    expect(r.success).toBe(true)
  })

  it("rechaza un usuario SIN área", () => {
    const r = usuarioEditarSchema.safeParse({ id: UUID, role: "usuario" })
    expect(r.success).toBe(false)
  })

  it("rechaza id que no es uuid", () => {
    const r = usuarioEditarSchema.safeParse({ id: "abc", role: "admin" })
    expect(r.success).toBe(false)
  })
})
