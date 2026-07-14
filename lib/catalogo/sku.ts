/** Palabras conectoras que se ignoran al generar el SKU. */
const CONECTORES = new Set([
  "DE",
  "DEL",
  "LA",
  "EL",
  "LOS",
  "LAS",
  "Y",
  "CON",
  "PARA",
  "A",
  "EN",
])

/** Marcas diacríticas (acentos) a eliminar tras normalizar a NFD. */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g")

/**
 * Genera un SKU a partir del nombre del producto (Spec 03).
 *
 * Patrón: MAYÚSCULAS, sin acentos, ignorando conectores.
 *   - 1 palabra   → primeras 4 letras            (LAPICERO -> LAPI)
 *   - 2+ palabras → primeras 3 de cada una, hasta 3 palabras, unidas con "-"
 *                   (lapicero azul -> LAP-AZU · papel higienico jumbo -> PAP-HIG-JUM)
 *
 * Si el resultado colisiona con un SKU ya existente, agrega un sufijo -2, -3, …
 */
export function generarSku(nombre: string, existentes: string[] = []): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(DIACRITICOS, "") // quita acentos
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ") // solo letras/números

  const palabras = limpio.split(/\s+/).filter(Boolean)
  const significativas = palabras.filter((w) => !CONECTORES.has(w))
  const usar = significativas.length ? significativas : palabras

  let base = ""
  if (usar.length === 1) {
    base = usar[0].slice(0, 4)
  } else if (usar.length > 1) {
    base = usar
      .slice(0, 3)
      .map((w) => w.slice(0, 3))
      .join("-")
  }

  if (!base) return ""

  const tomados = new Set(existentes.map((s) => s.toUpperCase()))
  if (!tomados.has(base)) return base

  let n = 2
  while (tomados.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
