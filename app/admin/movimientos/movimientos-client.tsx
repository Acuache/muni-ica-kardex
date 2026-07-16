"use client"

import { Fragment, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  RiAddLine,
  RiArrowLeftLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiArrowUpLine,
  RiDeleteBinLine,
  RiFileDownloadLine,
} from "@remixicon/react"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { TIPO_LABELS, TIPOS } from "@/lib/movimientos/constants"
import { crearLoteFormSchema } from "@/lib/movimientos/schemas"
import type {
  AreaOpcion,
  Movimiento,
  ProductoOpcion,
} from "@/lib/movimientos/types"
import { formatLote, padFolio } from "@/lib/movimientos/vale"

import { registrarLote } from "./actions"

/** Un lote agrupado para la vista general (Spec 06.1). */
type LoteVista = {
  id: string
  numero: number
  tipo: "entrada" | "salida"
  area_id: string | null
  area_nombre: string | null
  fecha: string
  usuario_email: string | null
  movimientos: Movimiento[]
}

/** Una línea del lote en el formulario. */
type LineaForm = { producto_id: string; cantidad: number }

type FormValues = {
  tipo: "entrada" | "salida"
  items: LineaForm[]
  area_id: string
  motivo: string
}

const DEFAULTS: FormValues = {
  tipo: "entrada",
  items: [],
  area_id: "",
  motivo: "",
}

const dtf = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "short",
  timeStyle: "short",
})

function fmtFecha(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : dtf.format(d)
}

function TipoBadge({ tipo }: { tipo: "entrada" | "salida" }) {
  return (
    <span
      className={
        tipo === "entrada"
          ? "inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          : "inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
      }
    >
      {TIPO_LABELS[tipo]}
    </span>
  )
}

export function MovimientosClient({
  movimientos,
  productos,
  areas,
  productoFiltrado,
}: {
  movimientos: Movimiento[]
  productos: ProductoOpcion[]
  areas: AreaOpcion[]
  productoFiltrado: { id: string; nombre: string } | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Filtro / orden en cliente.
  const [q, setQ] = useState("")
  const [tipoFilter, setTipoFilter] = useState<string>("all")
  const [areaFilter, setAreaFilter] = useState<string>("all")
  const [orden, setOrden] = useState<"reciente" | "antiguo">("reciente")

  // Filas de lote expandidas en la vista general.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  function toggleLote(id: string) {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // La vista de kardex por producto (`?producto=<id>`) muestra la tabla plana de
  // ese producto; la vista general muestra los lotes.
  const vistaProducto = productoFiltrado !== null

  const productoPorId = useMemo(
    () => new Map(productos.map((p) => [p.id, p])),
    [productos],
  )
  const stockPorId = useMemo(
    () => new Map(productos.map((p) => [p.id, p.stock_actual])),
    [productos],
  )
  const schema = useMemo(() => crearLoteFormSchema(stockPorId), [stockPorId])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: DEFAULTS,
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })
  const tipo = useWatch({ control: form.control, name: "tipo" })
  const itemsWatch = useWatch({ control: form.control, name: "items" })

  // Agrupa las líneas del formulario por categoría (salta a su grupo al
  // instante). Conserva el índice original del field. Grupos ordenados por
  // nombre de categoría.
  const gruposLineas = useMemo(() => {
    const byCat = new Map<
      string,
      { categoria: string; lineas: { fieldId: string; producto_id: string; index: number }[] }
    >()
    fields.forEach((f, index) => {
      const p = productoPorId.get(f.producto_id)
      const catId = p?.categoria_id ?? "sin"
      const categoria = p?.categoria_nombre ?? "Sin categoría"
      const grupo = byCat.get(catId) ?? { categoria, lineas: [] }
      grupo.lineas.push({ fieldId: f.id, producto_id: f.producto_id, index })
      byCat.set(catId, grupo)
    })
    return [...byCat.values()].sort((a, b) =>
      a.categoria.localeCompare(b.categoria, "es"),
    )
  }, [fields, productoPorId])

  const hayExceso = useMemo(() => {
    if (tipo !== "salida") return false
    return (itemsWatch ?? []).some((it) => {
      const stock = stockPorId.get(it.producto_id)
      return stock != null && Number(it.cantidad) > stock
    })
  }, [tipo, itemsWatch, stockPorId])

  // Buscador del formulario: sin texto ofrece todos los productos; con texto
  // filtra por nombre o SKU. El dropdown los agrupa por categoría.
  const [prodQuery, setProdQuery] = useState("")
  const [prodQueryDebounced, setProdQueryDebounced] = useState("")
  const [sugAbierta, setSugAbierta] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setProdQueryDebounced(prodQuery), 250)
    return () => clearTimeout(t)
  }, [prodQuery])

  const sugerencias = useMemo(() => {
    const term = prodQueryDebounced.trim().toLowerCase()
    if (!term) return productos
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term),
    )
  }, [productos, prodQueryDebounced])

  const sugerenciasAgrupadas = useMemo(() => {
    const byCat = new Map<
      string,
      { categoria: string; items: ProductoOpcion[] }
    >()
    for (const p of sugerencias) {
      const grupo = byCat.get(p.categoria_id) ?? {
        categoria: p.categoria_nombre,
        items: [],
      }
      grupo.items.push(p)
      byCat.set(p.categoria_id, grupo)
    }
    return [...byCat.values()].sort((a, b) =>
      a.categoria.localeCompare(b.categoria, "es"),
    )
  }, [sugerencias])

  function agregarProducto(p: ProductoOpcion) {
    const actuales = form.getValues("items")
    const idx = actuales.findIndex((it) => it.producto_id === p.id)
    if (idx >= 0) {
      const nueva = Number(actuales[idx].cantidad || 0) + 1
      form.setValue(`items.${idx}.cantidad`, nueva, { shouldValidate: true })
      setAviso(`«${p.nombre}» ya estaba en la lista; se sumó 1 (ahora ${nueva}).`)
    } else {
      append({ producto_id: p.id, cantidad: 1 })
      setAviso(null)
    }
    setProdQuery("")
    setProdQueryDebounced("")
    setSugAbierta(false)
  }

  function quitarLinea(index: number) {
    remove(index)
    setAviso(null)
  }

  /**
   * Dispara la descarga del vale consolidado de un lote. Si el navegador la
   * bloquea, el movimiento ya quedó y el botón «Vale» de la tabla reimprime.
   */
  function descargarVale(movimientoId: string) {
    const a = document.createElement("a")
    a.href = `/admin/movimientos/${movimientoId}/vale`
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // ---- Datos derivados para las tablas ----

  // Vista general: agrupa los movimientos en lotes.
  const lotes = useMemo(() => {
    const byLote = new Map<string, LoteVista>()
    for (const m of movimientos) {
      const l = byLote.get(m.lote_id)
      if (l) l.movimientos.push(m)
      else
        byLote.set(m.lote_id, {
          id: m.lote_id,
          numero: m.lote_numero,
          tipo: m.tipo,
          area_id: m.area_id,
          area_nombre: m.area_nombre,
          fecha: m.fecha,
          usuario_email: m.usuario_email,
          movimientos: [m],
        })
    }
    return [...byLote.values()]
  }, [movimientos])

  const lotesVisibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtrados = lotes.filter((l) => {
      const coincideTexto =
        !term ||
        formatLote(l.numero).toLowerCase().includes(term) ||
        l.movimientos.some(
          (m) =>
            (m.producto_nombre ?? "").toLowerCase().includes(term) ||
            (m.producto_sku ?? "").toLowerCase().includes(term),
        )
      const coincideTipo = tipoFilter === "all" || l.tipo === tipoFilter
      const coincideArea =
        areaFilter === "all" ||
        (areaFilter === "none" ? l.area_id === null : l.area_id === areaFilter)
      return coincideTexto && coincideTipo && coincideArea
    })
    return [...filtrados].sort((a, b) =>
      orden === "reciente" ? b.numero - a.numero : a.numero - b.numero,
    )
  }, [lotes, q, tipoFilter, areaFilter, orden])

  // Vista de kardex por producto: la tabla plana de movimientos de ese producto.
  const movimientosVisibles = useMemo(() => {
    const ordenados = [...movimientos].sort((a, b) => {
      const cmp = a.fecha.localeCompare(b.fecha)
      return orden === "reciente" ? -cmp : cmp
    })
    return ordenados
  }, [movimientos, orden])

  function openCreate() {
    setFormError(null)
    setAviso(null)
    const pre = productoFiltrado
      ? (productos.find((p) => p.id === productoFiltrado.id) ?? null)
      : null
    form.reset({
      ...DEFAULTS,
      items: pre ? [{ producto_id: pre.id, cantidad: 1 }] : [],
    })
    setProdQuery("")
    setProdQueryDebounced("")
    setSugAbierta(false)
    setDialogOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const res = await registrarLote({
        tipo: values.tipo,
        items: values.items,
        area_id: values.tipo === "salida" ? values.area_id : undefined,
        motivo: values.motivo,
      })
      if (res.ok) {
        if (values.tipo === "salida") {
          try {
            descargarVale(res.movimientoId)
          } catch {
            // el movimiento quedó; el botón «Vale» reimprime
          }
        }
        setDialogOpen(false)
        router.refresh()
      } else {
        setFormError(res.error)
      }
    })
  })

  const sinProductos = productos.length === 0
  const totalGeneral = vistaProducto ? movimientos.length : lotes.length
  const totalVisible = vistaProducto
    ? movimientosVisibles.length
    : lotesVisibles.length

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            {productoFiltrado ? `Kardex · ${productoFiltrado.nombre}` : "Movimientos"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {vistaProducto
              ? `${totalVisible} de ${totalGeneral} movimiento${totalGeneral === 1 ? "" : "s"}`
              : `${totalVisible} de ${totalGeneral} lote${totalGeneral === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button onClick={openCreate} disabled={sinProductos}>
          <RiAddLine /> Registrar
        </Button>
      </header>

      {productoFiltrado && (
        <Link
          href="/admin/movimientos"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RiArrowLeftLine className="size-4" /> Ver todos los movimientos
        </Link>
      )}

      {sinProductos && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          No hay productos vigentes para registrar movimientos.
        </p>
      )}

      {totalGeneral > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={
              vistaProducto
                ? "Buscar por producto o SKU…"
                : "Buscar por lote (L-…), producto o SKU…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select
            items={[
              { value: "all", label: "Todos los tipos" },
              ...TIPOS.map((t) => ({ value: t, label: TIPO_LABELS[t] })),
            ]}
            value={tipoFilter}
            onValueChange={(v) => setTipoFilter(v ?? "all")}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!vistaProducto && (
            <Select
              items={[
                { value: "all", label: "Todas las áreas" },
                { value: "none", label: "Sin área (entradas)" },
                ...areas.map((a) => ({ value: a.id, label: a.nombre })),
              ]}
              value={areaFilter}
              onValueChange={(v) => setAreaFilter(v ?? "all")}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las áreas</SelectItem>
                <SelectItem value="none">Sin área (entradas)</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() =>
              setOrden((o) => (o === "reciente" ? "antiguo" : "reciente"))
            }
          >
            {orden === "reciente" ? (
              <>
                <RiArrowDownLine className="size-4" /> Más reciente
              </>
            ) : (
              <>
                <RiArrowUpLine className="size-4" /> Más antiguo
              </>
            )}
          </Button>
        </div>
      )}

      {/* Vista de kardex por producto: tabla plana de movimientos. */}
      {vistaProducto ? (
        <div className="rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientosVisibles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aún no hay movimientos de este producto.
                  </TableCell>
                </TableRow>
              ) : (
                movimientosVisibles.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap font-medium tabular-nums">
                      {padFolio(m.folio)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatLote(m.lote_numero)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {fmtFecha(m.fecha)}
                    </TableCell>
                    <TableCell>
                      <TipoBadge tipo={m.tipo} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          m.tipo === "entrada"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }
                      >
                        {m.tipo === "entrada" ? "+" : "−"}
                        {m.cantidad}
                      </span>
                    </TableCell>
                    <TableCell>{m.area_nombre ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.motivo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.tipo === "salida" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title={`Descargar vale ${formatLote(m.lote_numero)}`}
                          aria-label={`Descargar vale ${formatLote(m.lote_numero)}`}
                          render={<a href={`/admin/movimientos/${m.id}/vale`} />}
                          nativeButton={false}
                        >
                          <RiFileDownloadLine /> Vale
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Vista general: tabla de lotes con filas expandibles. */
        <div className="rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Lote</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotesVisibles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {lotes.length === 0
                      ? "Aún no hay movimientos."
                      : "No hay lotes que coincidan con el filtro."}
                  </TableCell>
                </TableRow>
              ) : (
                lotesVisibles.map((lote) => {
                  const abierto = abiertos.has(lote.id)
                  const primero = lote.movimientos[0]
                  return (
                    <Fragment key={lote.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleLote(lote.id)}
                      >
                        <TableCell className="text-muted-foreground">
                          {abierto ? (
                            <RiArrowDownSLine className="size-4" />
                          ) : (
                            <RiArrowRightSLine className="size-4" />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium tabular-nums">
                          {formatLote(lote.numero)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                          {fmtFecha(lote.fecha)}
                        </TableCell>
                        <TableCell>
                          <TipoBadge tipo={lote.tipo} />
                        </TableCell>
                        <TableCell>{lote.area_nombre ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {lote.movimientos.length}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lote.usuario_email ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {lote.tipo === "salida" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={`Descargar vale ${formatLote(lote.numero)}`}
                              aria-label={`Descargar vale ${formatLote(lote.numero)}`}
                              render={
                                <a href={`/admin/movimientos/${primero.id}/vale`} />
                              }
                              nativeButton={false}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <RiFileDownloadLine /> Vale
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {abierto && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="bg-muted/30 p-0">
                            <div className="px-4 py-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Productos del lote
                              </p>
                              <div className="overflow-hidden rounded-md border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Folio</TableHead>
                                      <TableHead>Producto</TableHead>
                                      <TableHead className="text-right">
                                        Cantidad
                                      </TableHead>
                                      <TableHead>Motivo</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {lote.movimientos.map((m) => (
                                      <TableRow key={m.id}>
                                        <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                                          {padFolio(m.folio)}
                                        </TableCell>
                                        <TableCell>
                                          <div className="font-medium">
                                            {m.producto_nombre ?? "—"}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {m.producto_sku ?? ""}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          <span
                                            className={
                                              m.tipo === "entrada"
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : "text-amber-600 dark:text-amber-400"
                                            }
                                          >
                                            {m.tipo === "entrada" ? "+" : "−"}
                                            {m.cantidad}
                                          </span>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                          {m.motivo ?? "—"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Registro de movimiento multiproducto */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar movimiento</DialogTitle>
            <DialogDescription>
              Agrega uno o varios productos (de cualquier categoría). Una entrada
              suma stock; una salida lo resta y exige un área destino.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <Controller
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <Select
                    items={TIPOS.map((t) => ({
                      value: t,
                      label: TIPO_LABELS[t],
                    }))}
                    value={field.value || null}
                    onValueChange={(v) => {
                      const val = (v ?? "entrada") as FormValues["tipo"]
                      field.onChange(val)
                      if (val === "entrada") form.setValue("area_id", "")
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Buscador: agrega productos al lote (cualquier categoría). */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="producto">Agregar producto</Label>
              <div className="relative">
                <Input
                  id="producto"
                  autoComplete="off"
                  placeholder="Escribe por nombre o SKU, o abre para ver todos…"
                  value={prodQuery}
                  onChange={(e) => {
                    setProdQuery(e.target.value)
                    setSugAbierta(true)
                  }}
                  onFocus={() => setSugAbierta(true)}
                  onBlur={() => setTimeout(() => setSugAbierta(false), 120)}
                />
                {sugAbierta && sugerenciasAgrupadas.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    {sugerenciasAgrupadas.map((grupo) => (
                      <div key={grupo.categoria}>
                        <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {grupo.categoria}
                        </p>
                        <ul>
                          {grupo.items.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  agregarProducto(p)
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                              >
                                <span>
                                  {p.nombre}{" "}
                                  <span className="text-muted-foreground">
                                    ({p.sku})
                                  </span>
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  stock {p.stock_actual}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                {sugAbierta &&
                  prodQueryDebounced.trim() &&
                  sugerencias.length === 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
                      Sin coincidencias.
                    </div>
                  )}
              </div>
              {aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}
            </div>

            {/* Líneas del lote, agrupadas por categoría. */}
            {fields.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Aún no has agregado productos. Búscalos arriba y se agruparán por
                categoría.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {gruposLineas.map((grupo) => (
                  <div key={grupo.categoria} className="flex flex-col gap-2">
                    {/* Subtítulo de categoría siempre visible. */}
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {grupo.categoria}
                    </p>
                    {grupo.lineas.map((linea) => {
                      const prod = productoPorId.get(linea.producto_id)
                      const stock = prod?.stock_actual ?? 0
                      const cantidad = Number(
                        itemsWatch?.[linea.index]?.cantidad ?? 0,
                      )
                      const excede = tipo === "salida" && cantidad > stock
                      return (
                        <div
                          key={linea.fieldId}
                          className="flex items-start gap-2 rounded-md border border-border p-2"
                        >
                          <div className="flex flex-1 flex-col gap-1">
                            <div className="text-sm font-medium">
                              {prod?.nombre ?? "Producto"}{" "}
                              <span className="text-xs text-muted-foreground">
                                ({prod?.sku ?? "—"})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={tipo === "salida" ? stock : undefined}
                                aria-label={`Cantidad de ${prod?.nombre ?? "producto"}`}
                                className={cn(
                                  "h-8 w-24",
                                  excede &&
                                    "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
                                )}
                                {...form.register(
                                  `items.${linea.index}.cantidad`,
                                  { valueAsNumber: true },
                                )}
                              />
                              <span className="text-xs text-muted-foreground tabular-nums">
                                stock {stock}
                              </span>
                            </div>
                            {excede && (
                              <p className="text-xs text-destructive">
                                Solo hay {stock} disponibles.
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Quitar ${prod?.nombre ?? "producto"}`}
                            onClick={() => quitarLinea(linea.index)}
                          >
                            <RiDeleteBinLine />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {tipo === "salida" && (
              <div className="flex flex-col gap-1.5">
                <Label>Área destino</Label>
                <Controller
                  control={form.control}
                  name="area_id"
                  render={({ field }) => (
                    <Select
                      items={areas.map((a) => ({
                        value: a.id,
                        label: a.nombre,
                      }))}
                      value={field.value || null}
                      onValueChange={(v) => field.onChange(v ?? "")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona un área" />
                      </SelectTrigger>
                      <SelectContent>
                        {areas.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.area_id && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.area_id.message}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="motivo">Motivo (opcional)</Label>
              <Input
                id="motivo"
                placeholder="p. ej. Compra, entrega a área…"
                {...form.register("motivo")}
              />
            </div>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button
                type="submit"
                disabled={pending || fields.length === 0 || hayExceso}
              >
                {pending ? "Registrando…" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
