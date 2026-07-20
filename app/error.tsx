"use client"

import { ErrorState } from "@/components/error-state"

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  // `retry` re-fetchea el segmento; `reset` (la otra prop de Next) no puede
  // recuperarse de errores de Server Component, que es el caso aquí.
  return <ErrorState error={error} reset={retry} />
}
