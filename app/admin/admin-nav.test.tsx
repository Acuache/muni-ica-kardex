import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AdminNav } from "./admin-nav"

const usePathname = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ usePathname }))

describe("AdminNav", () => {
  it("marca como activa la sección de la ruta actual", () => {
    usePathname.mockReturnValue("/admin/productos")
    render(<AdminNav />)

    expect(screen.getByRole("link", { name: "Productos" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("link", { name: "Movimientos" })).not.toHaveAttribute(
      "aria-current",
    )
  })

  it("mantiene activa la sección en sus subrutas", () => {
    usePathname.mockReturnValue("/admin/productos/nuevo")
    render(<AdminNav />)

    expect(screen.getByRole("link", { name: "Productos" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  it("no confunde secciones con prefijo común", () => {
    usePathname.mockReturnValue("/admin/areas")
    render(<AdminNav />)

    const activos = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-current") === "page")
    expect(activos).toHaveLength(1)
    expect(activos[0]).toHaveTextContent("Áreas")
  })
})
