import { RiLoader4Line } from "@remixicon/react"

import { cn } from "@/lib/utils"

export function Spinner({ className }: { className?: string }) {
  return <RiLoader4Line aria-hidden className={cn("size-4 animate-spin", className)} />
}
