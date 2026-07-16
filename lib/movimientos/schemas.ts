import { z } from "zod"

import { TIPOS } from "./constants"

/**
 * Esquema de validación de un movimiento de kardex (Spec 05), compartido entre
 * el formulario (react-hook-form) y la Server Action. zod v4: formatos de
 * string en top-level (`z.uuid`) y customización de error con `error`.
 *
 * Las reglas de negocio "una salida exige área" / "una entrada no lleva área"
 * las garantizan además los `check` de la tabla; aquí se validan en cliente para
 * dar feedback inmediato en el formulario.
 */
export const movimientoSchema = z
  .object({
    tipo: z.enum(TIPOS, { error: "Selecciona el tipo de movimiento" }),
    producto_id: z.uuid({ error: "Selecciona un producto" }),
    cantidad: z.coerce
      .number({ error: "Ingresa un número" })
      .int({ error: "Debe ser un entero" })
      .positive({ error: "La cantidad debe ser mayor que 0" }),
    // "" (sin selección) se normaliza a undefined antes de validar el uuid.
    area_id: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.uuid({ error: "Área inválida" }).optional(),
    ),
    motivo: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  // Una salida SIEMPRE lleva área destino.
  .refine((v) => v.tipo !== "salida" || !!v.area_id, {
    error: "Una salida necesita un área destino",
    path: ["area_id"],
  })
  // Una entrada NUNCA lleva área.
  .refine((v) => v.tipo !== "entrada" || !v.area_id, {
    error: "Una entrada no lleva área",
    path: ["area_id"],
  })

export type MovimientoInput = z.input<typeof movimientoSchema>
export type MovimientoData = z.output<typeof movimientoSchema>

// ---------------------------------------------------------------------------
// Movimiento multiproducto / lote (Spec 06.1)
// ---------------------------------------------------------------------------
// Un registro lleva varios productos (de cualquier categoría) en una entrada o
// salida. Cada item es un producto + su cantidad; la categoría NO entra en el
// esquema (no se persiste, se deriva del producto). El servidor no impone
// "misma categoría": mezclar categorías es válido.

/** Una línea del lote: un producto y su cantidad. */
export const loteItemSchema = z.object({
  producto_id: z.uuid({ error: "Selecciona un producto" }),
  cantidad: z.coerce
    .number({ error: "Ingresa un número" })
    .int({ error: "Debe ser un entero" })
    .positive({ error: "La cantidad debe ser mayor que 0" }),
})

// Estructura común a servidor y formulario. Los refines de negocio y el tope de
// stock se aplican encima según el contexto.
const loteObject = z.object({
  tipo: z.enum(TIPOS, { error: "Selecciona el tipo de movimiento" }),
  items: z.array(loteItemSchema).min(1, { error: "Agrega al menos un producto" }),
  // "" (sin selección) se normaliza a undefined antes de validar el uuid.
  area_id: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.uuid({ error: "Área inválida" }).optional(),
  ),
  motivo: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
})

type LoteValue = z.output<typeof loteObject>

// Reglas de negocio compartidas (mismas que el movimiento simple del Spec 05).
const salidaLlevaArea = (v: LoteValue) => v.tipo !== "salida" || !!v.area_id
const entradaSinArea = (v: LoteValue) => v.tipo !== "entrada" || !v.area_id
const sinDuplicados = (v: LoteValue) =>
  new Set(v.items.map((i) => i.producto_id)).size === v.items.length

/**
 * Esquema de servidor del lote. Valida estructura y reglas de negocio, pero NO
 * el tope de stock: la autoridad del stock es la RPC, que revalida con la fila
 * bloqueada dentro de la transacción.
 */
export const movimientoLoteSchema = loteObject
  .refine(salidaLlevaArea, {
    error: "Una salida necesita un área destino",
    path: ["area_id"],
  })
  .refine(entradaSinArea, { error: "Una entrada no lleva área", path: ["area_id"] })
  .refine(sinDuplicados, {
    error: "Hay un producto repetido en el lote",
    path: ["items"],
  })

/**
 * Esquema de formulario. Añade el techo de stock por línea (solo en salida),
 * que depende de datos que solo tiene el navegador — por eso es una factory que
 * recibe el stock de cada producto. Es ayuda de captura para dar feedback
 * inmediato; la autoridad sigue siendo la RPC.
 */
export function crearLoteFormSchema(stockPorId: Map<string, number>) {
  return movimientoLoteSchema.superRefine((v, ctx) => {
    if (v.tipo !== "salida") return
    v.items.forEach((it, i) => {
      const stock = stockPorId.get(it.producto_id)
      if (stock != null && it.cantidad > stock) {
        ctx.addIssue({
          code: "custom",
          message: `Solo hay ${stock} disponibles`,
          path: ["items", i, "cantidad"],
        })
      }
    })
  })
}

export type LoteItemInput = z.input<typeof loteItemSchema>
export type MovimientoLoteInput = z.input<typeof movimientoLoteSchema>
export type MovimientoLoteData = z.output<typeof movimientoLoteSchema>
