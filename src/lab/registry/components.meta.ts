// Component permutation metadata — pure data, safe to import in the browser.
// The matching component references live in components.ts (build time only).
// Every combination of `axes` is pre-rendered at <LAB_BASE>/frame/<id>/<slug>.

import { LAB_BASE } from "../base"

export interface ComponentMeta {
  id: string
  name: string
  description: string
  axes: Record<string, string[]>
  defaults: Record<string, string>
  /** Text or HTML passed as the default slot / children */
  slot?: string
  /** Frame body padding in px */
  padding?: number
}

export const COMPONENTS: ComponentMeta[] = [
  {
    id: "button",
    name: "Button (shadcn)",
    description: "src/components/ui/button.tsx — every variant × size.",
    axes: {
      variant: [
        "default",
        "outline",
        "secondary",
        "ghost",
        "destructive",
        "link",
      ],
      size: ["default", "xs", "sm", "lg"],
    },
    defaults: { variant: "default", size: "default" },
    slot: "Get in touch",
    padding: 24,
  },
  {
    id: "pill",
    name: "Pill (site buttons)",
    description: "The .pill classes in global.css used by the hero and footer.",
    axes: {
      style: ["primary", "outline", "ghost", "link"],
      size: ["md", "sm", "fluid"],
    },
    defaults: { style: "primary", size: "md" },
    slot: "View Work",
    padding: 24,
  },
  {
    id: "accordion",
    name: "Accordion item",
    description: "src/components/AccordionItem.astro — native details/summary.",
    axes: { open: ["false", "true"] },
    defaults: { open: "false" },
    slot: "<p>Research, interaction design and a component library delivered across four product teams.</p>",
    padding: 24,
  },
  {
    id: "token-specimen",
    name: "Token contrast specimen",
    description:
      "Every text token on every surface token. Pair with the Text contrast check and the theme switch.",
    axes: {},
    defaults: {},
    padding: 0,
  },
]

export function componentMeta(id: string): ComponentMeta | undefined {
  return COMPONENTS.find((c) => c.id === id)
}

/** Deterministic, URL-safe slug for a permutation: "size-sm--variant-outline". */
export function permutationSlug(
  meta: ComponentMeta,
  props: Record<string, string> = {}
): string {
  const keys = Object.keys(meta.axes).sort()
  if (!keys.length) return "default"
  return keys
    .map((k) => `${k}-${props[k] ?? meta.defaults[k] ?? meta.axes[k][0]}`)
    .join("--")
}

export function allPermutations(meta: ComponentMeta): Record<string, string>[] {
  const keys = Object.keys(meta.axes)
  let out: Record<string, string>[] = [{}]
  for (const k of keys)
    out = out.flatMap((p) => meta.axes[k].map((v) => ({ ...p, [k]: v })))
  return out
}

export function framePath(
  id: string,
  props: Record<string, string> = {}
): string | null {
  const meta = componentMeta(id)
  return meta
    ? `${LAB_BASE}/frame/${meta.id}/${permutationSlug(meta, props)}`
    : null
}
