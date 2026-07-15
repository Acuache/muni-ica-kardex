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
