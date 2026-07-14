import { describe, expect, it } from "vitest"

import { generarSku } from "./sku"

describe("generarSku", () => {
  it("una palabra → primeras 4 letras", () => {
    expect(generarSku("Lapicero")).toBe("LAPI")
  })

  it("dos palabras → 3 + 3", () => {
    expect(generarSku("lapicero azul")).toBe("LAP-AZU")
  })

  it("tres palabras → 3 + 3 + 3", () => {
    expect(generarSku("papel higiénico jumbo")).toBe("PAP-HIG-JUM")
  })

  it("cuatro o más palabras → solo las 3 primeras", () => {
    expect(generarSku("cuaderno espiral grande escolar")).toBe("CUA-ESP-GRA")
  })

  it("ignora conectores (de, la, …)", () => {
    expect(generarSku("aceite de oliva")).toBe("ACE-OLI")
  })

  it("quita acentos y va en mayúsculas", () => {
    expect(generarSku("café")).toBe("CAFE")
  })

  it("nombre vacío → cadena vacía", () => {
    expect(generarSku("   ")).toBe("")
  })

  it("garantiza unicidad con sufijo incremental", () => {
    expect(generarSku("lapicero azul", ["LAP-AZU"])).toBe("LAP-AZU-2")
    expect(generarSku("lapicero azul", ["LAP-AZU", "LAP-AZU-2"])).toBe(
      "LAP-AZU-3",
    )
  })

  it("compara la unicidad sin distinguir mayúsculas", () => {
    expect(generarSku("Lapicero", ["lapi"])).toBe("LAPI-2")
  })
})
