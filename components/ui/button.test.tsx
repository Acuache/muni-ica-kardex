import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renderiza su contenido', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })
  it('aplica la variante destructive', () => {
    render(<Button variant="destructive">Eliminar</Button>)
    expect(screen.getByRole('button', { name: 'Eliminar' }).className).toContain('text-destructive')
  })
})
