import type { TipoMovimiento } from "./constants"

/** Fila de movimiento tal como la consume la UI (con joins resueltos). */
export type Movimiento = {
  id: string
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
