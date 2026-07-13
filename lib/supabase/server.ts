import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Cliente de Supabase para el servidor (Server Components, Server Actions,
 * Route Handlers). Lee y escribe las cookies de sesión con la API async de
 * cookies de Next 16.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // `setAll` se llamó desde un Server Component, donde no se pueden
            // escribir cookies. Se puede ignorar: el refresco de sesión lo hace
            // `proxy.ts` en cada request (Paso 5).
          }
        },
      },
    },
  )
}
