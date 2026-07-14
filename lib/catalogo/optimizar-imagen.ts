import imageCompression from "browser-image-compression"

import { IMAGEN } from "./constants"

/**
 * Optimización de imagen en el navegador (Spec 03). Valida tipo y tamaño de
 * entrada, y comprime/redimensiona a WebP con los límites de `IMAGEN` ANTES de
 * subir, para que el archivo pesado nunca viaje por la red. Solo cliente
 * (usa `browser-image-compression`, `File` y `URL.createObjectURL`).
 */

export type ImagenOptimizada = {
  /** Archivo WebP liviano, listo para subir a Storage. */
  file: File
  /** Object URL para la vista previa (recuerda revocarlo al descartar). */
  previewUrl: string
}

export type OptimizarResult =
  | { ok: true; data: ImagenOptimizada }
  | { ok: false; error: string }

export async function optimizarImagen(file: File): Promise<OptimizarResult> {
  if (!(IMAGEN.tiposAceptados as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Formato no soportado. Usa JPG, PNG o WebP." }
  }

  if (file.size > IMAGEN.maxEntradaMB * 1024 * 1024) {
    return {
      ok: false,
      error: `La imagen supera el máximo de ${IMAGEN.maxEntradaMB} MB.`,
    }
  }

  try {
    const comprimido = await imageCompression(file, {
      maxSizeMB: IMAGEN.maxSizeMB,
      maxWidthOrHeight: IMAGEN.maxWidthOrHeight,
      fileType: IMAGEN.fileType,
      useWebWorker: true,
    })

    // Renombrar a .webp (el compresor conserva el nombre original).
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".webp"
    const webp = new File([comprimido], nombre, { type: IMAGEN.fileType })

    return { ok: true, data: { file: webp, previewUrl: URL.createObjectURL(webp) } }
  } catch {
    return { ok: false, error: "No se pudo procesar la imagen. Intenta con otra." }
  }
}
