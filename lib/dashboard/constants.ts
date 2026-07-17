/**
 * Constantes del dashboard del admin (Spec 07). Umbrales y tamaños fijos, no
 * configurables desde la UI (decisión del spec): viven aquí, no en la base ni en
 * el perfil.
 */

/** Rangos (en días) que ofrece el selector; gobiernan solo los rankings y su KPI. */
export const RANGOS = [7, 30, 90] as const

export type Rango = (typeof RANGOS)[number]

/** Rango por defecto: un mes, el horizonte natural de un almacén. */
export const RANGO_DEFAULT: Rango = 30

/** Ventana de "próximos a caducar": perecibles con fecha ≤ hoy + este umbral. */
export const UMBRAL_CADUCIDAD_DIAS = 30

/** Tamaño de cada ranking (más/menos pedidos). */
export const TOP_N = 10
