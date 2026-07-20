import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Página no encontrada</h1>
      <p className="text-sm text-muted-foreground">
        La página que buscas no existe o fue movida.
      </p>
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
