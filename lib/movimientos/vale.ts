/**
 * Helpers del vale de salida (Spec 06). Puro formateo y armado de datos: aquí
 * no se lee la base ni se genera el PDF, para que todo esto sea testeable sin
 * levantar nada. El componente `ValePDF` solo pinta lo que sale de aquí.
 */
import type { DatosVale, MovimientoVale } from "./types"

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

/** Nombre del archivo descargado: `42` → `vale-000042.pdf`. */
export function nombreArchivoVale(folio: number): string {
  return `vale-${padFolio(folio)}.pdf`
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

/**
 * Arma los datos del vale desde el movimiento ya leído con sus joins.
 *
 * «Entregado por» prefiere el nombre de la persona: un vale se firma, y un
 * nombre se lee mejor que un correo. Cae al email si el perfil no está
 * completo, y a "—" si la cuenta fue eliminada (`usuario_id on delete set
 * null`, Spec 05) — el movimiento sobrevive a su autor.
 */
export function construirDatosVale(mov: MovimientoVale): DatosVale {
  const nombre = mov.autor_nombre?.trim()
  const email = mov.autor_email?.trim()
  const motivo = mov.motivo?.trim()

  return {
    folioTexto: formatFolio(mov.folio),
    fecha: formatFechaVale(mov.fecha),
    producto: mov.producto_nombre ?? VACIO,
    sku: mov.producto_sku ?? VACIO,
    cantidad: mov.cantidad,
    area: mov.area_nombre ?? VACIO,
    entregadoPor: nombre || email || VACIO,
    // Un motivo en blanco equivale a no tenerlo: la línea se omite entera.
    motivo: motivo ? motivo : null,
  }
}
