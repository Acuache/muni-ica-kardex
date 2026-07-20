import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Spinner } from "@/components/ui/spinner"

describe("Spinner", () => {
  it("aplica animate-spin al svg", () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector("svg")).toHaveClass("animate-spin")
  })
})
