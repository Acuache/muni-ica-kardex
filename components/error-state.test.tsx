import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ErrorState } from "@/components/error-state"

describe("ErrorState", () => {
  it("muestra el mensaje y el botón Reintentar invoca reset", async () => {
    const reset = vi.fn()
    render(<ErrorState error={new Error("boom")} reset={reset} />)

    expect(screen.getByText("Ocurrió un error inesperado.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
