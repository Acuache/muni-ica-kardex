/**
 * Constantes de movimientos de kardex (Spec 05): tipos de movimiento y sus
 * etiquetas para la UI. Compartidas entre el formulario, la tabla y los filtros.
 */

/** Tipos de movimiento posibles (coinciden con el `check` de la tabla). */
export const TIPOS = ["entrada", "salida"] as const

export type TipoMovimiento = (typeof TIPOS)[number]

/** Etiqueta legible por tipo de movimiento. */
export const TIPO_LABELS: Record<TipoMovimiento, string> = {
  entrada: "Entrada",
  salida: "Salida",
}
