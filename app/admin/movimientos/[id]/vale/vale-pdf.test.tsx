// @vitest-environment node
//
// `renderToBuffer` es la ruta de Node de @react-pdf/renderer (usa Buffer y
// streams); el entorno global del proyecto es jsdom, así que este archivo lo
// sobreescribe. El componente tampoco es React DOM: no hay nada que montar.
import { inflateSync } from "node:zlib"

import { describe, it, expect } from "vitest"

import { renderToBuffer } from "@react-pdf/renderer"

import type { DatosVale } from "@/lib/movimientos/types"

import { ValePDF } from "./vale-pdf"

const DATOS: DatosVale = {
  loteTexto: "L-000042",
  fecha: "14 de junio de 2026, 12:52",
  area: "Logística",
  entregadoPor: "Ana Ñuñez",
  motivo: "Entrega a Logística",
  grupos: [
    {
      categoria: "Oficina",
      items: [
        { folioTexto: "000042", producto: "Papel bond A4", sku: "PAP-001", cantidad: 3 },
      ],
    },
  ],
}

/** Vale consolidado: dos categorías, tres productos (Spec 06.1). */
const DATOS_MULTI: DatosVale = {
  loteTexto: "L-000042",
  fecha: "14 de junio de 2026, 12:52",
  area: "Logística",
  entregadoPor: "Ana Ñuñez",
  motivo: null,
  // Ya vienen ordenados por categoría (como los deja construirDatosVale):
  // Limpieza antes que Oficina. El componente pinta en el orden recibido.
  grupos: [
    {
      categoria: "Limpieza",
      items: [
        { folioTexto: "000043", producto: "Detergente", sku: "LI-DET", cantidad: 2 },
        { folioTexto: "000044", producto: "Lejía", sku: "LI-LEJ", cantidad: 5 },
      ],
    },
    {
      categoria: "Oficina",
      items: [
        { folioTexto: "000042", producto: "Papel bond A4", sku: "PAP-001", cantidad: 3 },
      ],
    },
  ],
}

/** Un fragmento de texto con su posición absoluta en la página. */
type Impreso = { texto: string; x: number; y: number }

/** Matriz afín de PDF: [a b c d e f]. */
type Matriz = [number, number, number, number, number, number]

const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0]

/** Concatena dos matrices (aplica `m` y luego `n`), como hace el operador `cm`. */
function multiplicar(m: Matriz, n: Matriz): Matriz {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

function inflarStreams(buffer: Buffer): string {
  const streams: string[] = []
  let i = 0
  while ((i = buffer.indexOf("stream", i)) !== -1) {
    let inicio = i + "stream".length
    if (buffer[inicio] === 0x0d) inicio++ // \r
    if (buffer[inicio] === 0x0a) inicio++ // \n
    const fin = buffer.indexOf("endstream", inicio)
    if (fin === -1) break
    try {
      streams.push(inflateSync(buffer.subarray(inicio, fin)).toString("latin1"))
    } catch {
      // No todo stream es Flate (p. ej. fuentes embebidas); se ignora.
    }
    i = fin + "endstream".length
  }
  return streams.join("\n")
}

/**
 * Extrae qué se imprime y DÓNDE.
 *
 * Afirmar solo sobre el texto deja pasar los fallos de maquetación: un vale con
 * el SKU escrito encima del nombre del producto contiene exactamente el mismo
 * texto que uno correcto. Por eso hace falta la posición.
 *
 * Los content streams van comprimidos con Flate; dentro, el texto viaja como
 * grupos hex Latin-1 en los arrays `TJ`, y su sitio en la página sale de la
 * pila de transformaciones (`q`/`Q`/`cm`) combinada con la matriz de texto
 * (`Tm`). En PDF la `y` crece hacia ARRIBA: más abajo en el papel = `y` menor.
 */
function textosImpresos(buffer: Buffer): Impreso[] {
  const impresos: Impreso[] = []
  const pila: Matriz[] = []
  let ctm: Matriz = [...IDENTIDAD]
  let tm: Matriz = [...IDENTIDAD]

  const numeros = String.raw`([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)`

  for (const linea of inflarStreams(buffer).split("\n")) {
    const l = linea.trim()

    if (l === "q") {
      pila.push([...ctm] as Matriz)
      continue
    }
    if (l === "Q") {
      ctm = pila.pop() ?? [...IDENTIDAD]
      continue
    }

    const cm = l.match(new RegExp(`^${numeros} cm$`))
    if (cm) {
      ctm = multiplicar(cm.slice(1).map(Number) as Matriz, ctm)
      continue
    }

    const matrizTexto = l.match(new RegExp(`^${numeros} Tm$`))
    if (matrizTexto) {
      tm = matrizTexto.slice(1).map(Number) as Matriz
      continue
    }

    const tj = l.match(/^\[(.*)\]\s*TJ$/)
    if (!tj) continue

    let texto = ""
    for (const grupo of tj[1].matchAll(/<([0-9a-fA-F]+)>/g)) {
      texto += Buffer.from(grupo[1], "hex").toString("latin1")
    }
    if (!texto.trim()) continue

    const final = multiplicar(tm, ctm)
    impresos.push({ texto, x: final[4], y: final[5] })
  }

  return impresos
}

async function render(datos: DatosVale) {
  const buffer = await renderToBuffer(<ValePDF datos={datos} />)
  const impresos = textosImpresos(buffer)
  return {
    buffer,
    impresos,
    texto: impresos.map((i) => i.texto).join("\n"),
    /** Primer fragmento que contiene el término. */
    buscar: (termino: string) =>
      impresos.find((i) => i.texto.includes(termino)),
  }
}

describe("ValePDF", () => {
  it("renderiza un PDF no vacío cuya firma es %PDF", async () => {
    const { buffer } = await render(DATOS)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  })

  it("lleva el encabezado municipal y el nombre del documento", async () => {
    const { texto } = await render(DATOS)
    expect(texto).toContain("Municipalidad Provincial de Ica")
    expect(texto).toContain("Vale de salida de almacén")
  })

  it("identifica el vale por el código de lote e imprime fecha, producto, SKU, cantidad y área", async () => {
    const { texto } = await render(DATOS)
    // El documento se identifica por el código de lote, no por «VALE N°».
    // (La etiqueta «Lote » y el código van en runs distintos del PDF.)
    expect(texto).toContain("L-000042")
    expect(texto).not.toContain("VALE N°")
    expect(texto).toContain("14 de junio de 2026, 12:52")
    expect(texto).toContain("Papel bond A4")
    expect(texto).toContain("PAP-001")
    // La cantidad va en la columna del detalle (cabecera "CANT.").
    expect(texto).toContain("CANT.")
    expect(texto).toContain("Área destino")
    expect(texto).toContain("Logística")
  })

  it("agrupa el detalle en una sección por categoría (Spec 06.1)", async () => {
    const { texto } = await render(DATOS_MULTI)
    // Dos subtítulos de categoría y los tres productos.
    expect(texto).toContain("Limpieza")
    expect(texto).toContain("Oficina")
    expect(texto).toContain("Detergente")
    expect(texto).toContain("Lejía")
    expect(texto).toContain("Papel bond A4")
  })

  it("lleva los dos recuadros de firma con nombre y DNI", async () => {
    const { texto } = await render(DATOS)
    expect(texto).toContain("Entregado por")
    expect(texto).toContain("Recibido por")
    expect(texto).toContain("DNI:")
    // Quien entrega ya lo sabe el sistema: su nombre va impreso en el recuadro.
    expect(texto).toContain("Ana Ñuñez")
  })

  it("imprime el motivo cuando el movimiento lo trae", async () => {
    const { texto } = await render(DATOS)
    expect(texto).toContain("Motivo")
    expect(texto).toContain("Entrega a Logística")
  })

  it("omite la etiqueta Motivo cuando es null (no imprime «null» ni un hueco)", async () => {
    const { texto } = await render({ ...DATOS, motivo: null })
    expect(texto).not.toContain("Motivo")
    expect(texto).not.toContain("null")
    // El resto del vale sigue intacto.
    expect(texto).toContain("Área destino")
  })

  it("imprime los acentos y la ñ, no cuadros ni signos de interrogación", async () => {
    const { texto } = await render({
      ...DATOS,
      area: "Gestión Tributaria",
      entregadoPor: "Íñigo Peña",
      grupos: [
        {
          categoria: "Ferretería",
          items: [
            { folioTexto: "000042", producto: "Cañería de ½ pulgada", sku: "FE-CAN", cantidad: 1 },
          ],
        },
      ],
    })
    expect(texto).toContain("Cañería")
    expect(texto).toContain("Ferretería")
    expect(texto).toContain("Gestión Tributaria")
    expect(texto).toContain("Íñigo Peña")
  })

  it("renderiza el vale de una cuenta eliminada sin imprimir «null»", async () => {
    // El «—» se codifica en WinAnsi (0x97) y no sobrevive al decodificado
    // latin1 del extractor, así que se afirma sobre lo verificable: el vale
    // sale entero y no filtra un `null` al papel.
    const { buffer, texto } = await render({ ...DATOS, entregadoPor: "—" })
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(texto).toContain("Entregado por")
    expect(texto).not.toContain("null")
  })

  it("es determinista: el mismo vale produce el mismo contenido", async () => {
    const a = await render(DATOS)
    const b = await render(DATOS)
    expect(a.texto).toBe(b.texto)
    expect(a.buffer.length).toBe(b.buffer.length)
  })
})

// Un vale con el texto correcto pero mal maquetado sigue siendo un vale roto, y
// el texto por sí solo no lo delata. Estos tests miran DÓNDE cae cada cosa.
describe("ValePDF · maquetación", () => {
  it("no escribe el SKU encima del nombre del producto", async () => {
    // Caso real que lo destapó: nombre y SKU de largo parecido se veían como
    // una sola cadena emborronada (`flex: 1` en el `Text`, no en la columna).
    const { buscar } = await render({
      ...DATOS,
      grupos: [
        {
          categoria: "Oficina",
          items: [
            { folioTexto: "000042", producto: "San Luis Gonzaga", sku: "SAN-LUI-GON", cantidad: 1 },
          ],
        },
      ],
    })

    const nombre = buscar("San Luis Gonzaga")
    const sku = buscar("SAN-LUI-GON")
    expect(nombre).toBeDefined()
    expect(sku).toBeDefined()

    // El SKU va debajo del nombre, con una línea real de separación.
    expect(nombre!.y - sku!.y).toBeGreaterThan(6)
  })

  it("pone el subtítulo de la categoría por encima de sus productos", async () => {
    const { buscar } = await render(DATOS)

    const categoria = buscar("Oficina")!.y
    const producto = buscar("Papel bond A4")!.y

    // La categoría encabeza la sección: va arriba (en PDF, y mayor = más arriba).
    expect(categoria).toBeGreaterThan(producto)
  })

  it("pone cada sección de categoría en orden, de arriba a abajo", async () => {
    const { buscar } = await render(DATOS_MULTI)

    // Se pintan en el orden del arreglo: Limpieza arriba, Oficina debajo.
    const limpieza = buscar("Limpieza")!.y
    const oficina = buscar("Oficina")!.y
    expect(limpieza).toBeGreaterThan(oficina)
  })

  it("alinea folio, producto y cantidad de un item en la misma fila", async () => {
    const { buscar } = await render(DATOS)

    const producto = buscar("Papel bond A4")!
    const cantidad = buscar("3")!

    // La cantidad va a la derecha del producto y en la misma línea.
    expect(cantidad.x).toBeGreaterThan(producto.x)
    expect(Math.abs(cantidad.y - producto.y)).toBeLessThan(3)
  })

  it("deja los dos recuadros de firma lado a lado y bajo el detalle", async () => {
    const { buscar } = await render(DATOS)

    const entrega = buscar("Entregado por")!
    const recibe = buscar("Recibido por")!
    const producto = buscar("Papel bond A4")!

    // Misma altura, uno a cada lado.
    expect(Math.abs(entrega.y - recibe.y)).toBeLessThan(3)
    expect(recibe.x).toBeGreaterThan(entrega.x)
    // Y por debajo del detalle de productos (en PDF, y menor = más abajo).
    expect(entrega.y).toBeLessThan(producto.y)
  })
})
