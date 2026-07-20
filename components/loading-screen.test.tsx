import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { LoadingScreen } from "@/components/loading-screen"

describe("LoadingScreen", () => {
  it("muestra el texto Cargando y el role status", () => {
    render(<LoadingScreen />)
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("Cargando…")
  })
})
