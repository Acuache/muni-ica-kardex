import type { TipoMovimiento } from "./constants"

/** Fila de movimiento tal como la consume la UI (con joins resueltos). */
export type Movimiento = {
  id: string
  /** Correlativo del vale (Spec 06); lo asigna la base, la app nunca lo fija. */
  folio: number
  /** Lote al que pertenece (Spec 06.1), para agrupar en la vista de lotes. */
  lote_id: string
  /** Correlativo del lote; la UI lo muestra como `L-000042`. */
  lote_numero: number
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

/** Producto vigente ofrecido en el buscador del formulario de registro. */
export type ProductoOpcion = {
  id: string
  nombre: string
  sku: string
  stock_actual: number
  /** Agrupa las líneas del formulario por categoría (Spec 06.1). */
  categoria_id: string
  categoria_nombre: string
}

/** Área ofrecida en el `select` de salida. */
export type AreaOpcion = {
  id: string
  nombre: string
}

/**
 * Fila de un movimiento con sus joins ya resueltos, tal como la lee el Route
 * Handler del vale (Spec 06 / 06.1). `construirDatosVale` recibe un arreglo de
 * estas: una por producto del lote (o una sola si el movimiento no tiene lote).
 */
export type MovimientoVale = {
  folio: number
  /** Correlativo del lote al que pertenece; identifica el documento (Spec 06.1). */
  lote_numero: number
  fecha: string
  cantidad: number
  motivo: string | null
  producto_nombre: string | null
  producto_sku: string | null
  /** Nombre de la categoría del producto; agrupa las líneas del vale (Spec 06.1). null ⇒ "Sin categoría". */
  categoria_nombre: string | null
  area_nombre: string | null
  /** `profiles.nombre` de quien registró; null si no completó su perfil. */
  autor_nombre: string | null
  /** `profiles.email` de quien registró; null si la cuenta fue eliminada. */
  autor_email: string | null
}

/** Una línea del vale, dentro de la sección de su categoría (Spec 06.1). */
export type ItemVale = {
  /** Folio de ESA fila, sin prefijo: "000043". */
  folioTexto: string
  producto: string
  sku: string
  cantidad: number
}

/** Una sección del vale: una categoría y sus productos (Spec 06.1). */
export type GrupoVale = {
  categoria: string
  items: ItemVale[]
}

/**
 * Datos ya derivados que consume el componente del PDF (Spec 06.1). Los campos
 * de documento (folio, fecha, área, autor, motivo) son del lote entero; los
 * productos van en `grupos`, una sección por categoría.
 */
export type DatosVale = {
  /** "L-000042" — el código de lote identifica el documento. */
  loteTexto: string
  /** Formateada en `America/Lima`. */
  fecha: string
  area: string
  /** `nombre` → `email` → "—". */
  entregadoPor: string
  /** `null` ⇒ la línea no se imprime en el vale. */
  motivo: string | null
  /** Un grupo con un item si el lote tiene un solo producto. */
  grupos: GrupoVale[]
}

/**
 * Resumen de un lote para la lista de Movimientos (Spec 06.1). Los atributos
 * comunes (tipo/área/fecha/autor) se derivan de los movimientos del lote; el
 * detalle de productos se ve al expandir la fila.
 */
export type LoteResumen = {
  id: string
  numero: number
  tipo: TipoMovimiento
  area_nombre: string | null
  /** Fecha del lote: la de sus movimientos (todos la comparten). */
  fecha: string
  /** Email de quien registró; "—" si la cuenta fue eliminada. */
  usuario_email: string | null
  /** Cuántos productos (filas) tiene el lote. */
  n_productos: number
}

/**
 * Un lote agrupado con sus movimientos completos, para la tabla expandible
 * de la vista general (Spec 06.1) — la usan admin (`movimientos-client.tsx`)
 * y usuario (Spec 08, `historial-client.tsx`). A diferencia de `LoteResumen`
 * (que resume en `n_productos`), esta trae el arreglo de `movimientos` para
 * poder pintar la subtabla al expandir la fila.
 */
export type LoteVista = {
  id: string
  numero: number
  tipo: TipoMovimiento
  area_id: string | null
  area_nombre: string | null
  /** Fecha del lote: la de sus movimientos (todos la comparten). */
  fecha: string
  /** Email de quien registró; "—" si la cuenta fue eliminada. */
  usuario_email: string | null
  movimientos: Movimiento[]
}
