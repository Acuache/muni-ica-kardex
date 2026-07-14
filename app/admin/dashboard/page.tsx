import { getProfile } from "@/lib/auth/profile"

/**
 * Dashboard placeholder del shell admin. El dashboard real (productos más/menos
 * pedidos, próximos a caducar, stock bajo) llega en su propio spec. El guard de
 * rol vive en `app/admin/layout.tsx`.
 */
export default async function AdminDashboardPage() {
  const profile = await getProfile()

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        Sesión iniciada como{" "}
        <span className="font-medium text-foreground">{profile?.email}</span>
        {profile ? (
          <span className="text-muted-foreground"> · {profile.role}</span>
        ) : null}
      </p>
    </main>
  )
}
