import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Rutas públicas: accesibles sin sesión. El resto son privadas y el proxy
// redirige a `/login` a quien no tenga usuario.
const PUBLIC_PATHS = ["/login"]

/**
 * Proxy de Next 16 (reemplaza a `middleware.ts`). En cada request:
 *  1. Refresca la sesión de Supabase y sincroniza las cookies en la respuesta.
 *  2. Redirige a `/login` a quien no tenga usuario en rutas privadas.
 *
 * Corre en runtime nodejs por defecto (no configurable en proxy).
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
          // Cabeceras anti-caché que la librería exige al escribir cookies de
          // auth (evita que un CDN sirva el token de un usuario a otro).
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
        },
      },
    },
  )

  // IMPORTANTE: no ejecutar código entre createServerClient y getUser(), para
  // no interferir con el refresco del token.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    const redirectResponse = NextResponse.redirect(url)
    // Conservar en la redirección las cookies que el refresco pudo escribir.
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  return response
}

export const config = {
  matcher: [
    // Ejecuta el proxy en todas las rutas salvo los assets estáticos de Next
    // y archivos de imagen (para no romper la carga de estáticos ni el logo).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
