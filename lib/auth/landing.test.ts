import { describe, expect, it } from "vitest"

import { resolveLanding } from "./landing"

describe("resolveLanding", () => {
  it("manda a /completar-perfil si el perfil está incompleto, sin importar el rol", () => {
    expect(
      resolveLanding({ role: "usuario", perfil_completo: false }),
    ).toBe("/completar-perfil")
    expect(
      resolveLanding({ role: "admin", perfil_completo: false }),
    ).toBe("/completar-perfil")
    expect(
      resolveLanding({ role: "superadmin", perfil_completo: false }),
    ).toBe("/completar-perfil")
  })

  it("manda al shell de usuario a un usuario con perfil completo", () => {
    expect(
      resolveLanding({ role: "usuario", perfil_completo: true }),
    ).toBe("/usuario/dashboard")
  })

  it("manda al shell de admin a admin y superadmin con perfil completo", () => {
    expect(
      resolveLanding({ role: "admin", perfil_completo: true }),
    ).toBe("/admin/dashboard")
    expect(
      resolveLanding({ role: "superadmin", perfil_completo: true }),
    ).toBe("/admin/dashboard")
  })
})
