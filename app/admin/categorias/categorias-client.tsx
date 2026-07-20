"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import { RiAddLine, RiDeleteBinLine, RiPencilLine } from "@remixicon/react"
import { useForm } from "react-hook-form"

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
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { categoriaSchema } from "@/lib/catalogo/schemas"
import type { Categoria } from "@/lib/catalogo/types"

import { crearCategoria, editarCategoria, eliminarCategoria } from "./actions"

export function CategoriasClient({ categorias }: { categorias: Categoria[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Categoria | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Categoria | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const form = useForm({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nombre: "", descripcion: "" },
  })

  function openCreate() {
    setEditing(null)
    setFormError(null)
    form.reset({ nombre: "", descripcion: "" })
    setDialogOpen(true)
  }

  function openEdit(cat: Categoria) {
    setEditing(cat)
    setFormError(null)
    form.reset({ nombre: cat.nombre, descripcion: cat.descripcion ?? "" })
    setDialogOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const res = editing
        ? await editarCategoria(editing.id, values)
        : await crearCategoria(values)
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
      const res = await eliminarCategoria(target.id)
      setDeleteTarget(null)
      if (res.ok) router.refresh()
      else setPageError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            {categorias.length} categoría{categorias.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <RiAddLine /> Nueva categoría
        </Button>
      </header>

      {pageError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {pageError}
        </p>
      )}

      <div className="rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-muted-foreground"
                >
                  Aún no hay categorías. Crea la primera.
                </TableCell>
              </TableRow>
            ) : (
              categorias.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.nombre}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {cat.descripcion ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${cat.nombre}`}
                        onClick={() => openEdit(cat)}
                      >
                        <RiPencilLine />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${cat.nombre}`}
                        onClick={() => {
                          setPageError(null)
                          setDeleteTarget(cat)
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar categoría" : "Nueva categoría"}
            </DialogTitle>
            <DialogDescription>
              El nombre debe ser único.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" autoFocus {...form.register("nombre")} />
              {form.formState.errors.nombre && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.nombre.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="descripcion">Descripción (opcional)</Label>
              <Textarea id="descripcion" {...form.register("descripcion")} />
            </div>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter>
              <DialogClose
                render={<Button type="button" variant="outline" />}
              >
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
            <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar «{deleteTarget?.nombre}»? Esta acción no se puede
              deshacer. No se podrá eliminar si tiene productos asociados.
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
