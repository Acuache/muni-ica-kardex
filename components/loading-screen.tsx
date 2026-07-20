import { Spinner } from "@/components/ui/spinner"

export function LoadingScreen() {
  return (
    <div
      role="status"
      className="flex min-h-40 flex-1 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"
    >
      <Spinner className="size-5" />
      Cargando…
    </div>
  )
}
