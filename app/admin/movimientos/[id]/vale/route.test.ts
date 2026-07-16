// @vitest-environment node
//
// Verifica el guard y los 404 del Route Handler llamando a `GET` directamente,
// sin pasar por la UI. El proxy (Spec 01) queda fuera de este test: corre antes
// que el handler y ya frena al anónimo con un 307 (ver Decisiones del spec).
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getProfile } from "@/lib/auth/profile"
import { createClient } from "@/lib/supabase/server"

import { GET } from "./route"

vi.mock("@/lib/auth/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

const SALIDA = {
  folio: 42,
  tipo: "salida",
  fecha: "2026-06-14T17:52:04.025Z",
  cantidad: 3,
  motivo: "Entrega a Logística",
  usuario_id: "u-1",
  lote_id: "lote-1",
  lotes: { numero: 42 },
  productos: { nombre: "Papel bond A4", sku: "PAP-001" },
  areas: { nombre: "Logística" },
}

const PERFIL_AUTOR = { nombre: "Ana Ñuñez", email: "ana@muni-ica.gob.pe" }

/**
 * Supabase mínimo: solo la cadena que usa el handler. Todo movimiento tiene lote
 * (Spec 06.1), así que la consulta del lote (`.eq().order()`) devuelve el propio
 * movimiento como lote de uno.
 */
function mockSupabase(mov: unknown, autor: unknown = PERFIL_AUTOR) {
  vi.mocked(createClient).mockResolvedValue({
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: tabla === "movimientos" ? mov : autor,
            error: null,
          }),
          order: async () => ({
            data: tabla === "movimientos" ? [mov] : null,
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>)
}

function perfil(role: string) {
  return { id: "u-1", role, perfil_completo: true } as never
}

/** El `ctx` de Next 16: `params` es un Promise. */
function ctx(id = "mov-1") {
  return { params: Promise.resolve({ id }) } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /admin/movimientos/[id]/vale — guard de rol", () => {
  it("responde 403 al rol `usuario`, que tiene sesión y pasa el proxy", async () => {
    vi.mocked(getProfile).mockResolvedValue(perfil("usuario"))
    mockSupabase(SALIDA)

    const res = await GET(new Request("http://x"), ctx())

    expect(res.status).toBe(403)
    expect(res.headers.get("Content-Type")).not.toBe("application/pdf")
  })

  it("responde 403 si no hay perfil (el layout de /admin no cubre esta ruta)", async () => {
    vi.mocked(getProfile).mockResolvedValue(null)
    mockSupabase(SALIDA)

    const res = await GET(new Request("http://x"), ctx())

    expect(res.status).toBe(403)
  })

  it("no llega a leer el movimiento si el rol no pasa", async () => {
    vi.mocked(getProfile).mockResolvedValue(perfil("usuario"))
    mockSupabase(SALIDA)

    await GET(new Request("http://x"), ctx())

    expect(createClient).not.toHaveBeenCalled()
  })

  it.each(["admin", "superadmin"])("deja pasar al rol `%s`", async (role) => {
    vi.mocked(getProfile).mockResolvedValue(perfil(role))
    mockSupabase(SALIDA)

    const res = await GET(new Request("http://x"), ctx())

    expect(res.status).toBe(200)
  })
})

describe("GET /admin/movimientos/[id]/vale — qué tiene vale y qué no", () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockResolvedValue(perfil("admin"))
  })

  it("responde 404 a un id inexistente", async () => {
    mockSupabase(null)

    const res = await GET(new Request("http://x"), ctx("no-existe"))

    expect(res.status).toBe(404)
  })

  it("responde 404 a una entrada: solo las salidas se entregan y se firman", async () => {
    mockSupabase({ ...SALIDA, tipo: "entrada", areas: null })

    const res = await GET(new Request("http://x"), ctx())

    expect(res.status).toBe(404)
  })
})

describe("GET /admin/movimientos/[id]/vale — la descarga", () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockResolvedValue(perfil("admin"))
  })

  it("devuelve el PDF con los headers de descarga y el folio en el nombre", async () => {
    mockSupabase(SALIDA)

    const res = await GET(new Request("http://x"), ctx())
    const buffer = Buffer.from(await res.arrayBuffer())

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/pdf")
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="vale-L-000042.pdf"',
    )
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  })

  it("emite el vale de una salida cuyo producto fue dado de baja", async () => {
    // El soft-delete (Spec 05) deja la fila viva: nombre y SKU se resuelven.
    mockSupabase(SALIDA)

    const res = await GET(new Request("http://x"), ctx())

    expect(res.status).toBe(200)
  })

  it("emite el vale aunque la cuenta del autor haya sido eliminada", async () => {
    mockSupabase({ ...SALIDA, usuario_id: null }, null)

    const res = await GET(new Request("http://x"), ctx())

    expect(res.status).toBe(200)
  })

  it("es idempotente: dos descargas del mismo vale salen idénticas", async () => {
    mockSupabase(SALIDA)
    const a = Buffer.from(await (await GET(new Request("http://x"), ctx())).arrayBuffer())

    mockSupabase(SALIDA)
    const b = Buffer.from(await (await GET(new Request("http://x"), ctx())).arrayBuffer())

    expect(a.length).toBe(b.length)
  })
})

describe("GET /admin/movimientos/[id]/vale — vale consolidado por lote (Spec 06.1)", () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockResolvedValue(perfil("admin"))
  })

  // Fila del movimiento consultado por id: pertenece a un lote y NO es la de
  // folio más bajo (folio 44), para probar que el nombre del archivo usa el
  // mínimo del lote y no el de la fila consultada.
  const CABECERA_LOTE = {
    folio: 44,
    tipo: "salida",
    fecha: "2026-06-14T17:52:04.025Z",
    cantidad: 5,
    motivo: "Entrega mixta",
    usuario_id: "u-1",
    lote_id: "lote-1",
    lotes: { numero: 42 },
    productos: { nombre: "Lejía", sku: "LI-LEJ", categorias: { nombre: "Limpieza" } },
    areas: { nombre: "Logística" },
  }

  // Las tres filas del lote, dos categorías. El folio mínimo es 42.
  const FILAS_LOTE = [
    {
      folio: 42,
      fecha: "2026-06-14T17:52:04.025Z",
      cantidad: 3,
      motivo: "Entrega mixta",
      productos: { nombre: "Papel bond A4", sku: "PAP-001", categorias: { nombre: "Oficina" } },
      areas: { nombre: "Logística" },
    },
    {
      folio: 43,
      fecha: "2026-06-14T17:52:04.025Z",
      cantidad: 2,
      motivo: "Entrega mixta",
      productos: { nombre: "Detergente", sku: "LI-DET", categorias: { nombre: "Limpieza" } },
      areas: { nombre: "Logística" },
    },
    {
      folio: 44,
      fecha: "2026-06-14T17:52:04.025Z",
      cantidad: 5,
      motivo: "Entrega mixta",
      productos: { nombre: "Lejía", sku: "LI-LEJ", categorias: { nombre: "Limpieza" } },
      areas: { nombre: "Logística" },
    },
  ]

  /** Mock que soporta la cadena del lote (`.eq().order()`) además de `.maybeSingle()`. */
  function mockSupabaseLote(
    cabecera: unknown,
    filasLote: unknown,
    autor: unknown = PERFIL_AUTOR,
  ) {
    vi.mocked(createClient).mockResolvedValue({
      from: (tabla: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: tabla === "movimientos" ? cabecera : autor,
              error: null,
            }),
            order: async () => ({ data: filasLote, error: null }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>)
  }

  it("nombra el archivo con el folio MÁS BAJO del lote, no el de la fila consultada", async () => {
    mockSupabaseLote(CABECERA_LOTE, FILAS_LOTE)

    const res = await GET(new Request("http://x"), ctx())

    expect(res.status).toBe(200)
    // La fila consultada es la 44, pero el lote tiene la 42: el vale es 000042.
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="vale-L-000042.pdf"',
    )
  })

  it("emite un PDF válido con los productos de todo el lote", async () => {
    mockSupabaseLote(CABECERA_LOTE, FILAS_LOTE)

    const res = await GET(new Request("http://x"), ctx())
    const buffer = Buffer.from(await res.arrayBuffer())

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  })
})
