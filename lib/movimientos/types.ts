import type { TipoMovimiento } from "./constants"

/** Fila de movimiento tal como la consume la UI (con joins resueltos). */
export type Movimiento = {
  id: string
  /** Correlativo del vale (Spec 06); lo asigna la base, la app nunca lo fija. */
  folio: number
  tipo: TipoMovimiento
  producto_id: string
  /** Nombre del producto; resuelto también para productos soft-eliminados. */
  producto_nombre: string | null
  producto_sku: string | null
  cantidad: number
  area_id: string | null
  area_nombre: string | null
  usuario_id: string | null
  /** Email de quien registró; "—" si la cuenta fue eliminada (usuario_id null). */
  usuario_email: string | null
  motivo: string | null
  fecha: string
}

/** Producto vigente ofrecido en el `select` del formulario de registro. */
export type ProductoOpcion = {
  id: string
  nombre: string
  sku: string
  stock_actual: number
}

/** Área ofrecida en el `select` de salida. */
export type AreaOpcion = {
  id: string
  nombre: string
}

/**
 * Movimiento de salida con sus joins ya resueltos, tal como lo lee el Route
 * Handler del vale (Spec 06). Es la entrada de `construirDatosVale`.
 */
export type MovimientoVale = {
  folio: number
  fecha: string
  cantidad: number
  motivo: string | null
  producto_nombre: string | null
  producto_sku: string | null
  area_nombre: string | null
  /** `profiles.nombre` de quien registró; null si no completó su perfil. */
  autor_nombre: string | null
  /** `profiles.email` de quien registró; null si la cuenta fue eliminada. */
  autor_email: string | null
}

/** Datos ya derivados que consume el componente del PDF (Spec 06). */
export type DatosVale = {
  /** "VALE N° 000042" */
  folioTexto: string
  /** Formateada en `America/Lima`. */
  fecha: string
  producto: string
  sku: string
  cantidad: number
  area: string
  /** `nombre` → `email` → "—". */
  entregadoPor: string
  /** `null` ⇒ la línea no se imprime en el vale. */
  motivo: string | null
}
