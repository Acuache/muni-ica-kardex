"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  RiAddLine,
  RiDeleteBinLine,
  RiKeyLine,
  RiPencilLine,
} from "@remixicon/react"
import { Controller, useForm, type Resolver } from "react-hook-form"

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
import { PASSWORD_POR_DEFECTO } from "@/lib/usuarios/constants"
import { usuarioCrearSchema } from "@/lib/usuarios/schemas"
import type { Area, UsuarioRow } from "@/lib/usuarios/types"

import {
  crearUsuario,
  editarUsuario,
  eliminarUsuario,
  resetearPassword,
} from "./actions"

/** Valor centinela para «sin área» en el Select (se mapea a "" en el form). */
const SIN_AREA = "__sin_area__"

type FormValues = {
  email: string
  role: "admin" | "usuario"
  area_id: string
  nombre: string
  telefono: string
}

const DEFAULTS: FormValues = {
  email: "",
  role: "usuario",
  area_id: "",
  nombre: "",
  telefono: "",
}

const ROLE_LABEL: Record<UsuarioRow["role"], string> = {
  superadmin: "Superadmin",
  admin: "Administrador",
  usuario: "Usuario",
}

export function UsuariosClient({
  usuarios,
  areas,
  currentUserId,
}: {
  usuarios: UsuarioRow[]
  areas: Area[]
  currentUserId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UsuarioRow | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<UsuarioRow | null>(null)
  const [resetTarget, setResetTarget] = useState<UsuarioRow | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(usuarioCrearSchema) as unknown as Resolver<FormValues>,
    defaultValues: DEFAULTS,
  })

  function openCreate() {
    setEditing(null)
    setFormError(null)
    form.reset(DEFAULTS)
    setDialogOpen(true)
  }

  function openEdit(u: UsuarioRow) {
    setEditing(u)
    setFormError(null)
    form.reset({
      email: u.email ?? "",
      role: u.role === "usuario" ? "usuario" : "admin",
      area_id: u.area_id ?? "",
      nombre: u.nombre ?? "",
      telefono: u.telefono ?? "",
    })
    setDialogOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const res = editing
        ? await editarUsuario({ id: editing.id, ...values })
        : await crearUsuario(values)
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
      const res = await eliminarUsuario(target.id)
      setDeleteTarget(null)
      if (res.ok) router.refresh()
      else setPageError(res.error)
    })
  }

  function confirmReset() {
    if (!resetTarget) return
    const target = resetTarget
    setPageError(null)
    startTransition(async () => {
      const res = await resetearPassword(target.id)
      setResetTarget(null)
      if (res.ok) router.refresh()
      else setPageError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            {usuarios.length} cuenta{usuarios.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <RiAddLine /> Nuevo usuario
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
              <TableHead>Email</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Área</TableHead>
              <TableHead className="w-32 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Aún no hay usuarios.
                </TableCell>
              </TableRow>
            ) : (
              usuarios.map((u) => {
                const esSuperadmin = u.role === "superadmin"
                const esUnoMismo = u.id === currentUserId
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.email ?? "—"}
                      {esUnoMismo && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (tú)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.nombre ?? "—"}
                    </TableCell>
                    <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.area_nombre ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${u.email ?? "usuario"}`}
                          disabled={esSuperadmin}
                          onClick={() => openEdit(u)}
                        >
                          <RiPencilLine />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Resetear contraseña de ${u.email ?? "usuario"}`}
                          disabled={esSuperadmin}
                          onClick={() => {
                            setPageError(null)
                            setResetTarget(u)
                          }}
                        >
                          <RiKeyLine />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Eliminar ${u.email ?? "usuario"}`}
                          disabled={esSuperadmin || esUnoMismo}
                          onClick={() => {
                            setPageError(null)
                            setDeleteTarget(u)
                          }}
                        >
                          <RiDeleteBinLine />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Alta / edición */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar usuario" : "Nuevo usuario"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "El email de acceso no se puede cambiar aquí."
                : `La cuenta se crea con la contraseña «${PASSWORD_POR_DEFECTO}». Nombre y teléfono son opcionales.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoFocus={!editing}
                readOnly={!!editing}
                className={editing ? "opacity-70" : undefined}
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Rol</Label>
                <Controller
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <Select
                      items={[
                        { value: "admin", label: "Administrador" },
                        { value: "usuario", label: "Usuario" },
                      ]}
                      value={field.value}
                      onValueChange={(v) =>
                        field.onChange((v as FormValues["role"]) ?? "usuario")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Rol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="usuario">Usuario</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Área</Label>
                <Controller
                  control={form.control}
                  name="area_id"
                  render={({ field }) => (
                    <Select
                      items={[
                        { value: SIN_AREA, label: "Sin área" },
                        ...areas.map((a) => ({ value: a.id, label: a.nombre })),
                      ]}
                      value={field.value || SIN_AREA}
                      onValueChange={(v) =>
                        field.onChange(v === SIN_AREA ? "" : (v ?? ""))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Área" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SIN_AREA}>Sin área</SelectItem>
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nombre">Nombre (opcional)</Label>
                <Input id="nombre" {...form.register("nombre")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="telefono">Teléfono (opcional)</Label>
                <Input id="telefono" {...form.register("telefono")} />
              </div>
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
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de reseteo de contraseña */}
      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetear contraseña</AlertDialogTitle>
            <AlertDialogDescription>
              La contraseña de «{resetTarget?.email}» volverá al valor por
              defecto «{PASSWORD_POR_DEFECTO}». El usuario podrá iniciar sesión
              con ella.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={confirmReset}>
              Resetear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de borrado */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la cuenta «{deleteTarget?.email}»? Esta acción no se
              puede deshacer y borra su perfil.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={confirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
