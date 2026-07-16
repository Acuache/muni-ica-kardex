/**
 * Helpers del vale de salida (Spec 06). Puro formateo y armado de datos: aquí
 * no se lee la base ni se genera el PDF, para que todo esto sea testeable sin
 * levantar nada. El componente `ValePDF` solo pinta lo que sale de aquí.
 */
import type { DatosVale, GrupoVale, ItemVale, MovimientoVale } from "./types"

/** Marca de dato ausente; un vale nunca imprime "null" ni un hueco. */
const VACIO = "—"

/** Dígitos mínimos del folio impreso: 42 → 000042. */
const FOLIO_DIGITOS = 6

/**
 * El folio tal como se lee en el papel: `42` → `000042`. Un folio más largo NO
 * se trunca (el documento manda sobre la estética del padding). Lo usa también
 * la columna Folio de la tabla, para que buscar el número del vale en pantalla
 * sea buscar el mismo número que trae impreso.
 */
export function padFolio(folio: number): string {
  return String(folio).padStart(FOLIO_DIGITOS, "0")
}

/** Encabezado del vale: `42` → `VALE N° 000042`. */
export function formatFolio(folio: number): string {
  return `VALE N° ${padFolio(folio)}`
}

/** Código de lote tal como se lee en pantalla y en el vale: `42` → `L-000042`. */
export function formatLote(numero: number): string {
  return `L-${padFolio(numero)}`
}

/** Nombre del archivo descargado, por lote: `42` → `vale-L-000042.pdf`. */
export function nombreArchivoVale(loteNumero: number): string {
  return `vale-${formatLote(loteNumero)}.pdf`
}

// Ica está en America/Lima; el servidor puede estar en cualquier huso, así que
// la zona se fija explícitamente — la fecha del vale es la hora local del
// almacén, no la del contenedor que lo genera.
const dtf = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Lima",
})

/** Formatea la fecha del movimiento en la zona horaria de Ica. */
export function formatFechaVale(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : dtf.format(d)
}

/** Categoría de una fila sin categoría resuelta; no debería ocurrir (la categoría es obligatoria). */
const SIN_CATEGORIA = "Sin categoría"

/**
 * Arma los datos del vale desde las filas del lote ya leídas con sus joins. Un
 * movimiento sin lote es un arreglo de una fila: produce un grupo con un item,
 * así que el camino de un solo producto y el de varios son el mismo código.
 *
 * Las filas se agrupan por categoría (secciones del vale). El documento se
 * identifica por el CÓDIGO DE LOTE (`L-000042`), no por un folio: el folio vive
 * por línea. Los campos de documento (fecha, área, autor, motivo) son del lote
 * entero: se toman de la fila de folio más bajo, que todas comparten por
 * registrarse juntas.
 *
 * «Entregado por» prefiere el nombre de la persona: un vale se firma, y un
 * nombre se lee mejor que un correo. Cae al email si el perfil no está
 * completo, y a "—" si la cuenta fue eliminada (`usuario_id on delete set
 * null`, Spec 05) — el movimiento sobrevive a su autor.
 */
export function construirDatosVale(movs: MovimientoVale[]): DatosVale {
  // Orden global por folio: fija el encabezado y deja cada grupo ordenado.
  const ordenados = [...movs].sort((a, b) => a.folio - b.folio)
  const rep = ordenados[0] // fila representativa del lote (folio más bajo)

  const nombre = rep.autor_nombre?.trim()
  const email = rep.autor_email?.trim()
  const motivo = rep.motivo?.trim()

  // Agrupa por categoría preservando el orden de folio dentro de cada grupo.
  const porCategoria = new Map<string, ItemVale[]>()
  for (const m of ordenados) {
    const cat = m.categoria_nombre?.trim() || SIN_CATEGORIA
    const item: ItemVale = {
      folioTexto: padFolio(m.folio),
      producto: m.producto_nombre ?? VACIO,
      sku: m.producto_sku ?? VACIO,
      cantidad: m.cantidad,
    }
    const arr = porCategoria.get(cat)
    if (arr) arr.push(item)
    else porCategoria.set(cat, [item])
  }

  // Secciones ordenadas por nombre de categoría: orden estable y predecible.
  const grupos: GrupoVale[] = [...porCategoria.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([categoria, items]) => ({ categoria, items }))

  return {
    loteTexto: formatLote(rep.lote_numero),
    fecha: formatFechaVale(rep.fecha),
    area: rep.area_nombre ?? VACIO,
    entregadoPor: nombre || email || VACIO,
    // Un motivo en blanco equivale a no tenerlo: la línea se omite entera.
    motivo: motivo ? motivo : null,
    grupos,
  }
}
