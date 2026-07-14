import { z } from "zod"

/**
 * Esquemas de validación del catálogo (Spec 03), compartidos entre el
 * formulario (react-hook-form) y las Server Actions. zod v4: formatos de string
 * en top-level (`z.uuid`, `z.iso.date`) y customización de error con `error`.
 */

export const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, { error: "El nombre es obligatorio" }),
  descripcion: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
})

export type CategoriaInput = z.input<typeof categoriaSchema>
export type CategoriaData = z.output<typeof categoriaSchema>

export const productoSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, { error: "El SKU es obligatorio" })
      .transform((s) => s.toUpperCase()),
    nombre: z
      .string()
      .trim()
      .min(1, { error: "El nombre es obligatorio" })
      // Capitaliza la primera letra (p. ej. "lapicero azul" → "Lapicero azul").
      .transform((s) => s.charAt(0).toUpperCase() + s.slice(1)),
    categoria_id: z.uuid({ error: "Selecciona una categoría" }),
    stock_actual: z.coerce
      .number({ error: "Ingresa un número" })
      .int({ error: "Debe ser un entero" })
      .min(0, { error: "El stock no puede ser negativo" }),
    stock_minimo: z.coerce
      .number({ error: "Ingresa un número" })
      .int({ error: "Debe ser un entero" })
      .min(0, { error: "El stock mínimo no puede ser negativo" }),
    es_perecible: z.boolean(),
    // La fecha es opcional; "" (input vacío) se normaliza a undefined.
    fecha_caducidad: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.iso.date({ error: "Fecha inválida" }).optional(),
    ),
    imagen_path: z.string().optional(),
  })
  // Solo un producto perecible puede llevar fecha de caducidad.
  .refine((v) => v.es_perecible || !v.fecha_caducidad, {
    error: "Solo un producto perecible puede llevar fecha de caducidad",
    path: ["fecha_caducidad"],
  })

export type ProductoInput = z.input<typeof productoSchema>
export type ProductoData = z.output<typeof productoSchema>
