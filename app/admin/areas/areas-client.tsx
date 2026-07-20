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
import { areaSchema } from "@/lib/usuarios/schemas"
import type { Area } from "@/lib/usuarios/types"

import { crearArea, editarArea, eliminarArea } from "./actions"

export function AreasClient({ areas }: { areas: Area[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Area | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Area | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const form = useForm({
    resolver: zodResolver(areaSchema),
    defaultValues: { nombre: "" },
  })

  function openCreate() {
    setEditing(null)
    setFormError(null)
    form.reset({ nombre: "" })
    setDialogOpen(true)
  }

  function openEdit(area: Area) {
    setEditing(area)
    setFormError(null)
    form.reset({ nombre: area.nombre })
    setDialogOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const res = editing
        ? await editarArea(editing.id, values)
        : await crearArea(values)
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
      const res = await eliminarArea(target.id)
      setDeleteTarget(null)
      if (res.ok) router.refresh()
      else setPageError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Áreas</h1>
          <p className="text-sm text-muted-foreground">
            {areas.length} área{areas.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <RiAddLine /> Nueva área
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
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="py-8 text-center text-muted-foreground"
                >
                  Aún no hay áreas. Crea la primera.
                </TableCell>
              </TableRow>
            ) : (
              areas.map((area) => (
                <TableRow key={area.id}>
                  <TableCell className="font-medium">{area.nombre}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${area.nombre}`}
                        onClick={() => openEdit(area)}
                      >
                        <RiPencilLine />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${area.nombre}`}
                        onClick={() => {
                          setPageError(null)
                          setDeleteTarget(area)
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
            <DialogTitle>{editing ? "Editar área" : "Nueva área"}</DialogTitle>
            <DialogDescription>El nombre debe ser único.</DialogDescription>
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
            <AlertDialogTitle>Eliminar área</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar «{deleteTarget?.nombre}»? Esta acción no se puede
              deshacer. No se podrá eliminar si tiene usuarios asignados.
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
