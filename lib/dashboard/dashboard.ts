/**
 * Helpers puros del dashboard (Spec 07). Vitest no prueba Server Components
 * `async` (limitación anotada en CLAUDE.md), así que toda la lógica testeable —
 * invertir/cortar el ranking, sumar el KPI, marcar vencido, validar el rango —
 * vive aquí, separada de `page.tsx`, y se cubre en `dashboard.test.ts`.
 */

import { RANGO_DEFAULT, RANGOS, type Rango } from "./constants"
import type { FilaPedido } from "./types"

/**
 * Deriva el ranking de "menos pedidos" a partir del de "más pedidos".
 * `dashboard_pedidos` devuelve las filas ordenadas por `total_unidades` DESC;
 * aquí se invierten (ASC) y se cortan a `n`, quedando primero el que menos salió.
 * No muta la entrada. Con menos de `2n` filas, sus elementos pueden coincidir con
 * los de "más pedidos" (es esperado: ambos rankings salen del mismo agregado),
 * pero dentro de este resultado nunca hay filas repetidas.
 */
export function menosPedidos(filas: FilaPedido[], n: number): FilaPedido[] {
  return [...filas].reverse().slice(0, n)
}

/** Suma total de unidades salidas del rango (KPI "Salidas del rango"). */
export function totalSalidas(filas: FilaPedido[]): number {
  return filas.reduce((acc, f) => acc + f.total_unidades, 0)
}

/** Fecha (calendario, UTC) de un `Date` como `YYYY-MM-DD`, para comparar días. */
function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * `true` si un perecible ya venció: su `fecha_caducidad` (ISO `YYYY-MM-DD`) es
 * anterior al día de `hoy`. El corte es por día de calendario, no por hora:
 * caducar hoy NO es estar vencido; caducar ayer sí.
 */
export function estaVencido(fecha: string, hoy: Date): boolean {
  return fecha < isoDia(hoy)
}

/**
 * Valida el `searchParam` del selector de rango y lo normaliza a un `Rango`
 * permitido. Cualquier valor fuera de `RANGOS` (o ausente / no numérico) cae al
 * `RANGO_DEFAULT`. Acepta la forma cruda de Next (`string | string[]`).
 */
export function diasRango(raw: string | string[] | undefined): Rango {
  const valor = Array.isArray(raw) ? raw[0] : raw
  const n = Number(valor)
  return (RANGOS as readonly number[]).includes(n) ? (n as Rango) : RANGO_DEFAULT
}
