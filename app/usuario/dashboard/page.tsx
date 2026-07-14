import { getProfile } from "@/lib/auth/profile"

/**
 * Dashboard placeholder del shell usuario. La vista real (historial de sus
 * salidas, de solo lectura) llega en su propio spec. El guard de rol vive en
 * `app/usuario/layout.tsx`.
 */
export default async function UsuarioDashboardPage() {
  const profile = await getProfile()

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        Sesión iniciada como{" "}
        <span className="font-medium text-foreground">
          {profile?.nombre ?? profile?.email}
        </span>
      </p>
    </main>
  )
}
