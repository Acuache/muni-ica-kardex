import { createBrowserClient } from "@supabase/ssr"

/**
 * Cliente de Supabase para el navegador (componentes cliente).
 * Usa la publishable key pública; la sesión vive en cookies gestionadas
 * por @supabase/ssr.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
