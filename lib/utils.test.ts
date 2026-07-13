import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('une clases', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
  it('resuelve conflictos de tailwind-merge (gana la última)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
  it('ignora valores falsy y condicionales', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })
})
