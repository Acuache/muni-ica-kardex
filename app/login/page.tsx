import { redirect } from "next/navigation"
import Image from "next/image"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import logo from "@/app/assets/logo.jpg"

import { LoginForm } from "./login-form"

export default async function LoginPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Si ya hay sesión, no tiene sentido mostrar el login: ir al dashboard.
  if (user) {
    redirect("/dashboard")
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center justify-items-center text-center">
          <Image
            src={logo}
            alt="Municipalidad de Ica"
            width={72}
            height={72}
            priority
            className="rounded-2xl"
          />
          <CardTitle>Kardex — Municipalidad de Ica</CardTitle>
          <CardDescription>Ingresa con tu correo y contraseña</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  )
}
