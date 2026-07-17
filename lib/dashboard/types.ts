/**
 * Tipos del dashboard del admin (Spec 07). Las dos primeras formas
 * (`FilaPedido`, `FilaSinMovimiento`) reflejan lo que devuelven las RPC
 * `dashboard_pedidos` / `dashboard_sin_movimiento`; las dos últimas
 * (`FilaCaducidad`, `FilaStockBajo`) reflejan los `select` de estado sobre
 * `productos`, con un campo derivado (`vencido` / `agotado`) para el badge.
 */

/** Fila del ranking de pedidos (RPC `dashboard_pedidos`). */
export type FilaPedido = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  total_unidades: number
}

/** Producto activo sin salidas en el rango (RPC `dashboard_sin_movimiento`). */
export type FilaSinMovimiento = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  stock_actual: number
}

/** Perecible próximo a caducar (o ya vencido). `vencido` se deriva del corte con hoy. */
export type FilaCaducidad = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  /** Fecha de caducidad en ISO (`YYYY-MM-DD`). */
  fecha_caducidad: string
  /** Derivado: `fecha_caducidad < hoy`. */
  vencido: boolean
}

/** Producto en o bajo su stock mínimo. `agotado` se deriva de `stock_actual === 0`. */
export type FilaStockBajo = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  stock_actual: number
  stock_minimo: number
  /** Derivado: `stock_actual === 0`. */
  agotado: boolean
}
