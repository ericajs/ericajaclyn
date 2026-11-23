// Build-time component references for the permutation frames. Add a component
// here and in components.meta.ts; the frame page renders every combination.
import { Button } from "@/components/ui/button"
import AccordionItem from "@/components/AccordionItem.astro"
import Pill from "../specimens/Pill.astro"
import TokenSpecimen from "../specimens/TokenSpecimen.astro"

// Astro and React components share the same render call in an .astro page
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const COMPONENT_REFS: Record<string, any> = {
  button: Button,
  pill: Pill,
  accordion: AccordionItem,
  "token-specimen": TokenSpecimen,
}

/** Props as the component expects them: "true"/"false" become booleans. */
export function coerce(props: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => [
      k,
      v === "true" ? true : v === "false" ? false : v,
    ])
  )
}
