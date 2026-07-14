/**
 * Constantes del catálogo (Spec 03): límites de optimización de imagen.
 */

/**
 * Límites de optimización de imagen de producto (browser-image-compression).
 * La imagen se convierte a WebP, se redimensiona a `maxWidthOrHeight` y se
 * apunta a `maxSizeMB` antes de subirla al bucket público `productos`.
 */
export const IMAGEN = {
  /** Lado mayor máximo tras redimensionar (px). */
  maxWidthOrHeight: 1024,
  /** Peso objetivo tras comprimir (MB). */
  maxSizeMB: 0.3,
  /** Formato de salida. */
  fileType: "image/webp",
  /** Bucket de Storage donde se guardan las imágenes. */
  bucket: "productos",
  /** Tipos MIME aceptados como entrada (antes de comprimir). */
  tiposAceptados: ["image/jpeg", "image/png", "image/webp"] as const,
  /** Peso máximo del archivo original aceptado antes de comprimir (MB). */
  maxEntradaMB: 10,
} as const
