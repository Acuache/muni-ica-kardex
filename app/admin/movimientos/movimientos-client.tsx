"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  RiAddLine,
  RiArrowLeftLine,
  RiArrowDownLine,
  RiArrowUpLine,
} from "@remixicon/react"
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form"

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
import { TIPO_LABELS, TIPOS } from "@/lib/movimientos/constants"
import { movimientoSchema } from "@/lib/movimientos/schemas"
import type {
  AreaOpcion,
  Movimiento,
  ProductoOpcion,
} from "@/lib/movimientos/types"

import { registrar } from "./actions"

type FormValues = {
  tipo: "entrada" | "salida"
  producto_id: string
  cantidad: number
  area_id: string
  motivo: string
}

const DEFAULTS: FormValues = {
  tipo: "entrada",
  producto_id: "",
  cantidad: 1,
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

  // Filtro / orden en cliente sobre la lista ya cargada.
  const [q, setQ] = useState("")
  const [tipoFilter, setTipoFilter] = useState<string>("all")
  const [areaFilter, setAreaFilter] = useState<string>("all")
  const [orden, setOrden] = useState<"reciente" | "antiguo">("reciente")

  const form = useForm<FormValues>({
    resolver: zodResolver(movimientoSchema) as unknown as Resolver<FormValues>,
    defaultValues: DEFAULTS,
  })
  const tipo = useWatch({ control: form.control, name: "tipo" })
  const productoId = useWatch({ control: form.control, name: "producto_id" })

  const productoSel = useMemo(
    () => productos.find((p) => p.id === productoId) ?? null,
    [productos, productoId],
  )

  // Autocompletado del campo Producto: texto libre + sugerencias con debounce.
  // Los productos ya vienen cargados; el debounce solo difiere el filtrado del
  // término mientras se escribe.
  const [prodQuery, setProdQuery] = useState("")
  const [prodQueryDebounced, setProdQueryDebounced] = useState("")
  const [sugAbierta, setSugAbierta] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setProdQueryDebounced(prodQuery), 250)
    return () => clearTimeout(t)
  }, [prodQuery])

  const sugerencias = useMemo(() => {
    const term = prodQueryDebounced.trim().toLowerCase()
    if (!term) return []
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term),
      )
      .slice(0, 8)
  }, [productos, prodQueryDebounced])

  function onProdInput(e: React.ChangeEvent<HTMLInputElement>) {
    setProdQuery(e.target.value)
    setSugAbierta(true)
    // Si el texto cambia, la selección previa deja de ser válida.
    if (productoId) form.setValue("producto_id", "")
  }

  function elegirProducto(p: ProductoOpcion) {
    const label = `${p.nombre} (${p.sku})`
    form.setValue("producto_id", p.id, { shouldValidate: true })
    setProdQuery(label)
    setProdQueryDebounced(label)
    setSugAbierta(false)
  }

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtrados = movimientos.filter((m) => {
      const coincideTexto =
        !term ||
        (m.producto_nombre ?? "").toLowerCase().includes(term) ||
        (m.producto_sku ?? "").toLowerCase().includes(term)
      const coincideTipo = tipoFilter === "all" || m.tipo === tipoFilter
      const coincideArea =
        areaFilter === "all" ||
        (areaFilter === "none" ? m.area_id === null : m.area_id === areaFilter)
      return coincideTexto && coincideTipo && coincideArea
    })
    const ordenados = [...filtrados].sort((a, b) => {
      const cmp = a.fecha.localeCompare(b.fecha)
      return orden === "reciente" ? -cmp : cmp
    })
    return ordenados
  }, [movimientos, q, tipoFilter, areaFilter, orden])

  function openCreate() {
    setFormError(null)
    // En la vista de kardex por producto, preselecciona ese producto (si sigue
    // vigente, es decir, presente en la lista del formulario).
    const pre = productoFiltrado
      ? (productos.find((p) => p.id === productoFiltrado.id) ?? null)
      : null
    form.reset({ ...DEFAULTS, producto_id: pre?.id ?? "" })
    const label = pre ? `${pre.nombre} (${pre.sku})` : ""
    setProdQuery(label)
    setProdQueryDebounced(label)
    setSugAbierta(false)
    setDialogOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const res = await registrar({
        ...values,
        // La entrada no lleva área; se normaliza aquí y en la RPC.
        area_id: values.tipo === "salida" ? values.area_id : undefined,
      })
      if (res.ok) {
        setDialogOpen(false)
        router.refresh()
      } else {
        setFormError(res.error)
      }
    })
  })

  const sinProductos = productos.length === 0

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            {productoFiltrado ? `Kardex · ${productoFiltrado.nombre}` : "Movimientos"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {visibles.length} de {movimientos.length} movimiento
            {movimientos.length === 1 ? "" : "s"}
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

      {movimientos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por producto o SKU…"
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

      <div className="rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  {movimientos.length === 0
                    ? "Aún no hay movimientos."
                    : "No hay movimientos que coincidan con el filtro."}
                </TableCell>
              </TableRow>
            ) : (
              visibles.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {fmtFecha(m.fecha)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        m.tipo === "entrada"
                          ? "inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                          : "inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                      }
                    >
                      {TIPO_LABELS[m.tipo]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{m.producto_nombre ?? "—"}</div>
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
                  <TableCell>{m.area_nombre ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.usuario_email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.motivo ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Registro de movimiento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar movimiento</DialogTitle>
            <DialogDescription>
              Una entrada suma stock; una salida lo resta y exige un área destino.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
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
                        // La entrada no lleva área: límpiala al cambiar de tipo.
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cantidad">Cantidad</Label>
                <Input
                  id="cantidad"
                  type="number"
                  min={1}
                  {...form.register("cantidad", { valueAsNumber: true })}
                />
                {form.formState.errors.cantidad && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.cantidad.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="producto">Producto</Label>
              <div className="relative">
                <Input
                  id="producto"
                  autoComplete="off"
                  placeholder="Escribe para buscar por nombre o SKU…"
                  value={prodQuery}
                  onChange={onProdInput}
                  onFocus={() => {
                    if (prodQuery.trim()) setSugAbierta(true)
                  }}
                  // Cierra tras el click (onMouseDown de la opción va antes del blur).
                  onBlur={() => setTimeout(() => setSugAbierta(false), 120)}
                />
                {sugAbierta && sugerencias.length > 0 && (
                  <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    {sugerencias.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            elegirProducto(p)
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
                )}
                {sugAbierta &&
                  prodQueryDebounced.trim() &&
                  sugerencias.length === 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
                      Sin coincidencias.
                    </div>
                  )}
              </div>
              {productoSel && (
                <p className="text-xs text-muted-foreground">
                  Stock actual: {productoSel.stock_actual}
                </p>
              )}
              {form.formState.errors.producto_id && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.producto_id.message}
                </p>
              )}
            </div>

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
              <Button type="submit" disabled={pending}>
                {pending ? "Registrando…" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
