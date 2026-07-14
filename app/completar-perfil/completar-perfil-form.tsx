"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { completarPerfil, type OnboardingState } from "./actions"

const initialState: OnboardingState = { error: null }

type Props = {
  defaultNombre?: string
  defaultTelefono?: string
}

export function CompletarPerfilForm({ defaultNombre, defaultTelefono }: Props) {
  const [state, formAction, pending] = useActionState(
    completarPerfil,
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre">Nombre completo</Label>
        <Input
          id="nombre"
          name="nombre"
          type="text"
          autoComplete="name"
          defaultValue={defaultNombre}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="telefono">Teléfono</Label>
        <Input
          id="telefono"
          name="telefono"
          type="tel"
          autoComplete="tel"
          defaultValue={defaultTelefono}
          required
        />
      </div>
      {state.error && (
        <p aria-live="polite" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar y continuar"}
      </Button>
    </form>
  )
}
