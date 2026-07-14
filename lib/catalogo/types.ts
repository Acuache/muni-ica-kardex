/** Tipos de fila del catálogo (Spec 03), tal como los consume la UI. */

export type Categoria = {
  id: string
  nombre: string
  descripcion: string | null
  created_at: string
}

export type Producto = {
  id: string
  sku: string
  nombre: string
  categoria_id: string
  stock_actual: number
  stock_minimo: number
  es_perecible: boolean
  fecha_caducidad: string | null
  imagen_path: string | null
  created_at: string
  /** Nombre de la categoría (join en la consulta de listado). */
  categoria_nombre?: string | null
}
