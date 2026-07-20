"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

export function ErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="text-sm font-medium">Ocurrió un error inesperado.</p>
      <p className="text-sm text-muted-foreground">
        Intenta de nuevo; si el problema persiste, contacta al administrador.
      </p>
      <Button variant="outline" onClick={reset}>
        Reintentar
      </Button>
    </div>
  )
}
