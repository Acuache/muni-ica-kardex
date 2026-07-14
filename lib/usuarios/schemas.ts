import { z } from "zod"

/**
 * Esquemas de validación de áreas y usuarios (Spec 04), compartidos entre los
 * formularios (react-hook-form) y las Server Actions. zod v4: formatos de string
 * en top-level (`z.email`, `z.uuid`) y customización de error con `error`.
 */

// ---------------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------------
export const areaSchema = z.object({
  nombre: z.string().trim().min(1, { error: "El nombre es obligatorio" }),
})

export type AreaInput = z.input<typeof areaSchema>
export type AreaData = z.output<typeof areaSchema>

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------
// Campos opcionales de primer ingreso: "" (input vacío) se normaliza a undefined.
const nombreOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

const telefonoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

// area_id opcional: "" o ausente → undefined; si viene, debe ser uuid.
const areaIdOpcional = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.uuid({ error: "Área inválida" }).optional(),
)

// Un usuario con rol `usuario` REQUIERE área; un `admin` puede no tenerla.
const requiereAreaSiUsuario = {
  check: (v: { role: "admin" | "usuario"; area_id?: string }) =>
    v.role !== "usuario" || !!v.area_id,
  message: { error: "Un usuario necesita un área asignada", path: ["area_id"] },
}

/** Alta: email + rol obligatorios; área requerida solo si rol=usuario. */
export const usuarioCrearSchema = z
  .object({
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
      z.email({ error: "Email inválido" }),
    ),
    role: z.enum(["admin", "usuario"]), // 'superadmin' nunca es opción
    area_id: areaIdOpcional,
    nombre: nombreOpcional,
    telefono: telefonoOpcional,
  })
  .refine(requiereAreaSiUsuario.check, requiereAreaSiUsuario.message)

export type UsuarioCrearInput = z.input<typeof usuarioCrearSchema>
export type UsuarioCrearData = z.output<typeof usuarioCrearSchema>

/** Edición: sin email (no se cambia el acceso); mismo requisito de área. */
export const usuarioEditarSchema = z
  .object({
    id: z.uuid({ error: "Usuario inválido" }),
    role: z.enum(["admin", "usuario"]),
    area_id: areaIdOpcional,
    nombre: nombreOpcional,
    telefono: telefonoOpcional,
  })
  .refine(requiereAreaSiUsuario.check, requiereAreaSiUsuario.message)

export type UsuarioEditarInput = z.input<typeof usuarioEditarSchema>
export type UsuarioEditarData = z.output<typeof usuarioEditarSchema>
