"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  RiAddLine,
  RiDeleteBinLine,
  RiHistoryLine,
  RiImageLine,
  RiPencilLine,
} from "@remixicon/react"
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { IMAGEN } from "@/lib/catalogo/constants"
import { optimizarImagen } from "@/lib/catalogo/optimizar-imagen"
import { productoSchema } from "@/lib/catalogo/schemas"
import { generarSku } from "@/lib/catalogo/sku"
import type { Categoria, Producto } from "@/lib/catalogo/types"
import { createClient } from "@/lib/supabase/client"

import { crearProducto, editarProducto, eliminarProducto } from "./actions"

type FormValues = {
  sku: string
  nombre: string
  categoria_id: string
  stock_actual: number
  stock_minimo: number
  es_perecible: boolean
  fecha_caducidad: string
}

const DEFAULTS: FormValues = {
  sku: "",
  nombre: "",
  categoria_id: "",
  stock_actual: 0,
  stock_minimo: 0,
  es_perecible: false,
  fecha_caducidad: "",
}

/** Opciones de orden de la lista de productos. */
const ORDENES = [
  { value: "nombre", label: "Nombre (A–Z)" },
  { value: "stock_desc", label: "Más stock" },
  { value: "stock_asc", label: "Menos stock" },
  { value: "caducidad", label: "Caducidad próxima" },
] as const

export function ProductosClient({
  productos,
  categorias,
}: {
  productos: Producto[]
  categorias: Categoria[]
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [pending, startTransition] = useTransition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [skuAuto, setSkuAuto] = useState(true)

  const [deleteTarget, setDeleteTarget] = useState<Producto | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  // Filtro / orden (en cliente sobre la lista ya cargada).
  const [q, setQ] = useState("")
  const [catFilter, setCatFilter] = useState<string>("all")
  const [orden, setOrden] = useState<string>("nombre")

  // Estado de imagen (fuera de react-hook-form).
  const [imagenActual, setImagenActual] = useState<string | null>(null)
  const [nuevaImagen, setNuevaImagen] = useState<File | null>(null)
  const [quitarImagen, setQuitarImagen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [imgError, setImgError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(productoSchema) as unknown as Resolver<FormValues>,
    defaultValues: DEFAULTS,
  })
  const esPerecible = useWatch({ control: form.control, name: "es_perecible" })
  const nombreActual = useWatch({ control: form.control, name: "nombre" })

  // SKUs ya usados (excluyendo el del producto en edición), para dedupe.
  const skusExistentes = useMemo(
    () => productos.filter((p) => p.id !== editing?.id).map((p) => p.sku),
    [productos, editing],
  )

  // En modo automático, el SKU se deriva del nombre y se mantiene único.
  useEffect(() => {
    if (!skuAuto) return
    form.setValue("sku", generarSku(nombreActual ?? "", skusExistentes))
  }, [skuAuto, nombreActual, skusExistentes, form])

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtrados = productos.filter((p) => {
      const coincideTexto =
        !term ||
        p.nombre.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
      const coincideCat = catFilter === "all" || p.categoria_id === catFilter
      return coincideTexto && coincideCat
    })

    const ordenados = [...filtrados]
    switch (orden) {
      case "stock_desc":
        ordenados.sort((a, b) => b.stock_actual - a.stock_actual)
        break
      case "stock_asc":
        ordenados.sort((a, b) => a.stock_actual - b.stock_actual)
        break
      case "caducidad":
        // Perecibles con fecha primero (próxima a caducar); sin fecha al final.
        ordenados.sort((a, b) => {
          const fa = a.fecha_caducidad
          const fb = b.fecha_caducidad
          if (fa && fb) return fa.localeCompare(fb)
          if (fa) return -1
          if (fb) return 1
          return a.nombre.localeCompare(b.nombre)
        })
        break
      default:
        ordenados.sort((a, b) => a.nombre.localeCompare(b.nombre))
    }
    return ordenados
  }, [productos, q, catFilter, orden])

  function urlPublica(path: string) {
    return supabase.storage.from(IMAGEN.bucket).getPublicUrl(path).data.publicUrl
  }

  function resetImagen(actual: string | null) {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview)
    setImagenActual(actual)
    setNuevaImagen(null)
    setQuitarImagen(false)
    setPreview(actual ? urlPublica(actual) : null)
    setImgError(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function openCreate() {
    setEditing(null)
    setFormError(null)
    setSkuAuto(true)
    form.reset(DEFAULTS)
    resetImagen(null)
    setDialogOpen(true)
  }

  function openEdit(p: Producto) {
    setEditing(p)
    setFormError(null)
    setSkuAuto(false)
    form.reset({
      sku: p.sku,
      nombre: p.nombre,
      categoria_id: p.categoria_id,
      stock_actual: p.stock_actual,
      stock_minimo: p.stock_minimo,
      es_perecible: p.es_perecible,
      fecha_caducidad: p.fecha_caducidad ?? "",
    })
    resetImagen(p.imagen_path)
    setDialogOpen(true)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgError(null)
    const res = await optimizarImagen(file)
    if (!res.ok) {
      setImgError(res.error)
      return
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview)
    setNuevaImagen(res.data.file)
    setPreview(res.data.previewUrl)
    setQuitarImagen(false)
  }

  function onQuitarImagen() {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview)
    setNuevaImagen(null)
    setPreview(null)
    setQuitarImagen(true)
    if (fileRef.current) fileRef.current.value = ""
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      // Resolver el path de la imagen.
      let path: string | undefined = imagenActual ?? undefined
      if (quitarImagen) path = undefined
      if (nuevaImagen) {
        const key = `prod-${crypto.randomUUID()}.webp`
        const { error: upErr } = await supabase.storage
          .from(IMAGEN.bucket)
          .upload(key, nuevaImagen, {
            contentType: IMAGEN.fileType,
            upsert: false,
          })
        if (upErr) {
          setFormError("No se pudo subir la imagen. Inténtalo de nuevo.")
          return
        }
        path = key
      }

      const payload = { ...values, imagen_path: path }
      const res = editing
        ? await editarProducto(editing.id, payload)
        : await crearProducto(payload)

      if (res.ok) {
        setDialogOpen(false)
        router.refresh()
      } else {
        setFormError(res.error)
      }
    })
  })

  function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setPageError(null)
    startTransition(async () => {
      const res = await eliminarProducto(target.id)
      setDeleteTarget(null)
      if (res.ok) router.refresh()
      else setPageError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Productos</h1>
          <p className="text-sm text-muted-foreground">
            {visibles.length} de {productos.length} producto
            {productos.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate} disabled={categorias.length === 0}>
          <RiAddLine /> Nuevo producto
        </Button>
      </header>

      {categorias.length === 0 && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Crea al menos una categoría antes de registrar productos.
        </p>
      )}

      {pageError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {pageError}
        </p>
      )}

      {productos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nombre o SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select
            items={[
              { value: "all", label: "Todas las categorías" },
              ...categorias.map((c) => ({ value: c.id, label: c.nombre })),
            ]}
            value={catFilter}
            onValueChange={(v) => setCatFilter(v ?? "all")}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={ORDENES.map((o) => ({ value: o.value, label: o.label }))}
            value={orden}
            onValueChange={(v) => setOrden(v ?? "nombre")}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              {ORDENES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Imagen</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Caducidad</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  {productos.length === 0
                    ? "Aún no hay productos."
                    : "No hay productos que coincidan con el filtro."}
                </TableCell>
              </TableRow>
            ) : (
              visibles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.imagen_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urlPublica(p.imagen_path)}
                        alt={p.nombre}
                        className="size-9 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="grid size-9 place-items-center rounded-md border text-muted-foreground">
                        <RiImageLine className="size-4" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                  <TableCell>{p.categoria_nombre ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={
                        p.stock_actual <= p.stock_minimo
                          ? "text-destructive"
                          : undefined
                      }
                    >
                      {p.stock_actual}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.es_perecible ? (p.fecha_caducidad ?? "Sin fecha") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Ver kardex de ${p.nombre}`}
                        title="Ver kardex"
                        render={
                          <Link href={`/admin/movimientos?producto=${p.id}`} />
                        }
                        // Base UI asume un <button> nativo salvo que se le diga
                        // lo contrario; aquí el elemento real es el <a> de
                        // <Link>, que ya trae su propia semántica accesible.
                        nativeButton={false}
                      >
                        <RiHistoryLine />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${p.nombre}`}
                        onClick={() => openEdit(p)}
                      >
                        <RiPencilLine />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${p.nombre}`}
                        onClick={() => {
                          setPageError(null)
                          setDeleteTarget(p)
                        }}
                      >
                        <RiDeleteBinLine />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Alta / edición */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar producto" : "Nuevo producto"}
            </DialogTitle>
            <DialogDescription>
              El SKU debe ser único. La imagen es opcional y se optimiza a WebP.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="sku">SKU</Label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={skuAuto}
                      onCheckedChange={(c) => setSkuAuto(Boolean(c))}
                    />
                    Automático
                  </label>
                </div>
                <Input
                  id="sku"
                  readOnly={skuAuto}
                  className={skuAuto ? "uppercase opacity-70" : "uppercase"}
                  placeholder={
                    skuAuto ? "Se genera del nombre" : "Escribe el SKU"
                  }
                  {...form.register("sku")}
                />
                {form.formState.errors.sku && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.sku.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nombre">Nombre del producto</Label>
                <Input id="nombre" {...form.register("nombre")} />
                {form.formState.errors.nombre && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.nombre.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Categoría</Label>
              <Controller
                control={form.control}
                name="categoria_id"
                render={({ field }) => (
                  <Select
                    items={categorias.map((c) => ({
                      value: c.id,
                      label: c.nombre,
                    }))}
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.categoria_id && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.categoria_id.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stock_actual">Stock inicial</Label>
                <Input
                  id="stock_actual"
                  type="number"
                  min={0}
                  {...form.register("stock_actual", { valueAsNumber: true })}
                />
                {form.formState.errors.stock_actual && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.stock_actual.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stock_minimo">Stock mínimo</Label>
                <Input
                  id="stock_minimo"
                  type="number"
                  min={0}
                  {...form.register("stock_minimo", { valueAsNumber: true })}
                />
                {form.formState.errors.stock_minimo && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.stock_minimo.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Controller
                control={form.control}
                name="es_perecible"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="es_perecible"
                      checked={field.value}
                      onCheckedChange={(c) => {
                        const val = Boolean(c)
                        field.onChange(val)
                        if (!val) form.setValue("fecha_caducidad", "")
                      }}
                    />
                    <Label htmlFor="es_perecible">Es perecible</Label>
                  </div>
                )}
              />
              {esPerecible && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fecha_caducidad">
                    Fecha de caducidad (opcional)
                  </Label>
                  <Input
                    id="fecha_caducidad"
                    type="date"
                    {...form.register("fecha_caducidad")}
                  />
                  {form.formState.errors.fecha_caducidad && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.fecha_caducidad.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Imagen (opcional)</Label>
              <div className="flex items-center gap-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Vista previa"
                    className="size-16 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="grid size-16 place-items-center rounded-lg border text-muted-foreground">
                    <RiImageLine />
                  </div>
                )}
                <div className="flex flex-col items-start gap-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFile}
                    className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm"
                  />
                  {preview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onQuitarImagen}
                    >
                      Quitar imagen
                    </Button>
                  )}
                </div>
              </div>
              {imgError && (
                <p className="text-sm text-destructive">{imgError}</p>
              )}
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
                {pending && <Spinner />}
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar «{deleteTarget?.nombre}»? Sale del catálogo, pero su
              historial de movimientos (kardex) se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={confirmDelete}
            >
              {pending && <Spinner />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
