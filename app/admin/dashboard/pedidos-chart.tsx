"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { FilaPedido } from "@/lib/dashboard/types"

const config = {
  total_unidades: {
    label: "Unidades",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

/**
 * Gráfico de barras del Top 10 "más pedidos" por suma de unidades salidas
 * (Spec 07). Client Component aislado (`"use client"`): recibe los datos ya
 * calculados por props, así la página que lo envuelve sigue siendo Server
 * Component. Barras horizontales (`layout="vertical"`) para que los nombres de
 * producto quepan en el eje. Se cortan los nombres largos en el tick.
 */
export function PedidosChart({ datos }: { datos: FilaPedido[] }) {
  return (
    <ChartContainer config={config} className="h-[320px] w-full">
      <BarChart
        accessibilityLayer
        data={datos}
        layout="vertical"
        margin={{ left: 8, right: 24 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" dataKey="total_unidades" hide />
        <YAxis
          type="category"
          dataKey="nombre"
          tickLine={false}
          axisLine={false}
          width={140}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="total_unidades" fill="var(--color-total_unidades)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
