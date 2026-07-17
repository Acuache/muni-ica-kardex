import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TOP_N, UMBRAL_CADUCIDAD_DIAS } from "@/lib/dashboard/constants"
import {
  diasRango,
  estaVencido,
  menosPedidos,
  totalSalidas,
} from "@/lib/dashboard/dashboard"
import type {
  FilaCaducidad,
  FilaPedido,
  FilaSinMovimiento,
  FilaStockBajo,
} from "@/lib/dashboard/types"
import { createClient } from "@/lib/supabase/server"

import { PedidosChart } from "./pedidos-chart"
import { RangoSelector } from "./rango-selector"

/** Enlace de cada producto a su kardex filtrado (reusa el filtro del Spec 05). */
const kardexHref = (id: string) => `/admin/movimientos?producto=${id}`

/** Nombre de categoría desde el embed de PostgREST (objeto, arreglo o null). */
function catNombre(embed: unknown): string | null {
  if (!embed) return null
  if (Array.isArray(embed)) return embed[0]?.nombre ?? null
  return (embed as { nombre?: string }).nombre ?? null
}

/** Fecha ISO (`YYYY-MM-DD`) a `dd/mm/aaaa`, sin desplazamiento de zona. */
function fmtFecha(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-PE")
}

/** Tarjeta KPI: una cifra grande con su etiqueta y una pista opcional. */
function Kpi({
  label,
  valor,
  hint,
}: {
  label: string
  valor: number
  hint: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {valor.toLocaleString("es-PE")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

/** Mensaje de sección vacía, en lugar de una lista o gráfico vacío. */
function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
  )
}

/** Fila de un ranking de pedidos: nombre, sku·categoría y la métrica, enlazada. */
function FilaRanking({ fila }: { fila: FilaPedido }) {
  return (
    <li>
      <Link
        href={kardexHref(fila.producto_id)}
        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{fila.nombre}</span>
          <span className="truncate text-xs text-muted-foreground">
            {fila.sku}
            {fila.categoria_nombre ? ` · ${fila.categoria_nombre}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {fila.total_unidades.toLocaleString("es-PE")} u
        </span>
      </Link>
    </li>
  )
}

/**
 * Dashboard del admin (Spec 07): rankings de pedidos en un rango seleccionable
 * (7/30/90 días), próximos a caducar y stock bajo, sobre agregados del kardex.
 * Server Component: lee el rango de `searchParams.dias`, llama las RPC
 * `security invoker` (respetan la RLS `is_admin()`) y los `select` de estado, y
 * pinta el tablero. El guard de rol vive en `app/admin/layout.tsx`.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>
}) {
  const { dias } = await searchParams
  const rango = diasRango(dias)
  const supabase = await createClient()

  // Umbral de caducidad: hoy + 30 días (incluye vencidos, que son < hoy).
  const hoy = new Date()
  const limite = new Date(hoy)
  limite.setUTCDate(limite.getUTCDate() + UMBRAL_CADUCIDAD_DIAS)
  const limiteISO = limite.toISOString().slice(0, 10)

  const [pedidosRes, sinMovRes, caducidadRes, stockBajoRes, activosRes] =
    await Promise.all([
      // Rankings (dependen del rango): agregados en Postgres vía RPC.
      supabase.rpc("dashboard_pedidos", { p_dias: rango }),
      supabase.rpc("dashboard_sin_movimiento", { p_dias: rango }),
      // Estado actual (NO dependen del rango): select directo + RPC trivial.
      supabase
        .from("productos")
        .select("id, sku, nombre, fecha_caducidad, categorias(nombre)")
        .eq("eliminado", false)
        .eq("es_perecible", true)
        .not("fecha_caducidad", "is", null)
        .lte("fecha_caducidad", limiteISO)
        .order("fecha_caducidad", { ascending: true }),
      supabase.rpc("dashboard_stock_bajo"),
      supabase
        .from("productos")
        .select("*", { count: "exact", head: true })
        .eq("eliminado", false),
    ])

  // total_unidades vuelve como bigint; se normaliza a number.
  const pedidos: FilaPedido[] = (pedidosRes.data ?? []).map(
    (r: FilaPedido) => ({
      producto_id: r.producto_id,
      sku: r.sku,
      nombre: r.nombre,
      categoria_nombre: r.categoria_nombre,
      total_unidades: Number(r.total_unidades),
    }),
  )
  const masPedidos = pedidos.slice(0, TOP_N)
  const menos = menosPedidos(pedidos, TOP_N)
  const sinMovimiento = (sinMovRes.data ?? []) as FilaSinMovimiento[]

  const caducidad: FilaCaducidad[] = (
    caducidadRes.data ??
    ([] as Array<{
      id: string
      sku: string
      nombre: string
      fecha_caducidad: string
      categorias: unknown
    }>)
  ).map((r) => ({
    producto_id: r.id,
    sku: r.sku,
    nombre: r.nombre,
    categoria_nombre: catNombre(r.categorias),
    fecha_caducidad: r.fecha_caducidad,
    vencido: estaVencido(r.fecha_caducidad, hoy),
  }))

  const stockBajo: FilaStockBajo[] = (
    stockBajoRes.data ?? []
  ).map(
    (r: Omit<FilaStockBajo, "agotado">): FilaStockBajo => ({
      ...r,
      agotado: r.stock_actual === 0,
    }),
  )

  const salidasRango = totalSalidas(pedidos)
  const productosActivos = activosRes.count ?? 0

  return (
    <main className="flex-1 space-y-6 p-6">
      {/* Encabezado + selector de rango */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos de los últimos {rango} días y estado del inventario.
          </p>
        </div>
        <RangoSelector valor={rango} />
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Salidas del rango"
          valor={salidasRango}
          hint={`Unidades salidas en ${rango} días`}
        />
        <Kpi
          label="Próximos a caducar"
          valor={caducidad.length}
          hint={`Perecibles a ≤ ${UMBRAL_CADUCIDAD_DIAS} días (incluye vencidos)`}
        />
        <Kpi
          label="Stock bajo"
          valor={stockBajo.length}
          hint="En o bajo su mínimo"
        />
        <Kpi
          label="Productos activos"
          valor={productosActivos}
          hint="No eliminados"
        />
      </div>

      {/* Más pedidos: gráfico + lista */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Más pedidos</CardTitle>
            <CardDescription>
              Top {TOP_N} por unidades salidas en {rango} días
            </CardDescription>
          </CardHeader>
          <CardContent>
            {masPedidos.length > 0 ? (
              <PedidosChart datos={masPedidos} />
            ) : (
              <Vacio>Sin datos en este rango</Vacio>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ranking de más pedidos</CardTitle>
            <CardDescription>Los que más volumen se llevaron</CardDescription>
          </CardHeader>
          <CardContent>
            {masPedidos.length > 0 ? (
              <ol className="flex flex-col gap-0.5">
                {masPedidos.map((f) => (
                  <FilaRanking key={f.producto_id} fila={f} />
                ))}
              </ol>
            ) : (
              <Vacio>Sin datos en este rango</Vacio>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Menos pedidos + Sin movimiento */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Menos pedidos</CardTitle>
            <CardDescription>
              Los que menos salieron (con ≥ 1 salida en {rango} días)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {menos.length > 0 ? (
              <ol className="flex flex-col gap-0.5">
                {menos.map((f) => (
                  <FilaRanking key={f.producto_id} fila={f} />
                ))}
              </ol>
            ) : (
              <Vacio>Sin datos en este rango</Vacio>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sin movimiento</CardTitle>
            <CardDescription>
              Productos activos sin salidas en {rango} días
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sinMovimiento.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {sinMovimiento.map((f) => (
                  <li key={f.producto_id}>
                    <Link
                      href={kardexHref(f.producto_id)}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {f.nombre}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {f.sku}
                          {f.categoria_nombre ? ` · ${f.categoria_nombre}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        stock {f.stock_actual.toLocaleString("es-PE")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>Todos los productos tuvieron salidas en el rango</Vacio>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Próximos a caducar + Stock bajo (estado actual, no dependen del rango) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próximos a caducar</CardTitle>
            <CardDescription>
              Perecibles con caducidad ≤ {UMBRAL_CADUCIDAD_DIAS} días (incluye
              vencidos)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {caducidad.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {caducidad.map((f) => (
                  <li key={f.producto_id}>
                    <Link
                      href={kardexHref(f.producto_id)}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {f.nombre}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {f.sku}
                          {f.categoria_nombre ? ` · ${f.categoria_nombre}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {f.vencido ? (
                          <Badge variant="destructive">Vencido</Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmtFecha(f.fecha_caducidad)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>Nada por caducar</Vacio>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock bajo</CardTitle>
            <CardDescription>
              En o bajo su mínimo (agotados primero)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stockBajo.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {stockBajo.map((f) => (
                  <li key={f.producto_id}>
                    <Link
                      href={kardexHref(f.producto_id)}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {f.nombre}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {f.sku}
                          {f.categoria_nombre ? ` · ${f.categoria_nombre}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {f.agotado ? (
                          <Badge variant="destructive">Agotado</Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {f.stock_actual.toLocaleString("es-PE")} /{" "}
                          {f.stock_minimo.toLocaleString("es-PE")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>Todo el stock está sobre el mínimo</Vacio>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
