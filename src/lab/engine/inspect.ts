// Property specs for the Inspect tool: box model, type, color with design
// token matches, contrast and the element's accessible role/name.

import { accessibleName, effectiveBackground } from "./analyze"
import { selectorFor } from "./anchor"
import {
  composite,
  judgeText,
  parseColor,
  toHex,
  type ContrastVerdict,
} from "./color"

export interface Spec {
  tag: string
  selector: string
  role: string
  name: string
  rect: { x: number; y: number; w: number; h: number }
  padding: number[]
  margin: number[]
  border: number[]
  radius: string
  type?: {
    family: string
    size: number
    lineHeight: string
    weight: string
    letterSpacing: string
    transform: string
  }
  colors: { label: string; hex: string; tokens: string[] }[]
  contrast?:
    | (ContrastVerdict & { fg: string; bg: string })
    | { unknown: string }
  classes: string[]
}

const IMPLICIT: Record<string, string> = {
  a: "link",
  button: "button",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  aside: "complementary",
  img: "img",
  ul: "list",
  ol: "list",
  li: "listitem",
  form: "form",
  table: "table",
  select: "combobox",
  textarea: "textbox",
  summary: "button",
  details: "group",
  dialog: "dialog",
  figure: "figure",
  section: "region",
  article: "article",
}

export function roleOf(el: Element): string {
  const explicit = el.getAttribute("role")
  if (explicit) return explicit
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return `heading (level ${tag[1]})`
  if (tag === "a" && !el.hasAttribute("href")) return "generic"
  if (tag === "input") {
    const t = (el as HTMLInputElement).type
    return t === "checkbox"
      ? "checkbox"
      : t === "radio"
        ? "radio"
        : t === "range"
          ? "slider"
          : ["submit", "button", "reset"].includes(t)
            ? "button"
            : "textbox"
  }
  return IMPLICIT[tag] ?? "generic"
}

/** hex → custom property names whose computed value is that color. */
export function tokenIndex(doc: Document): Map<string, string[]> {
  const names = new Set<string>()
  const visit = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      const sr = r as CSSStyleRule
      if (sr.selectorText && /:root|\.dark|^html/.test(sr.selectorText)) {
        for (let i = 0; i < sr.style.length; i++) {
          const p = sr.style[i]
          if (p.startsWith("--")) names.add(p)
        }
      }
      const inner = (r as CSSGroupingRule).cssRules
      if (inner) visit(inner)
    }
  }
  for (const s of Array.from(doc.styleSheets)) {
    try {
      visit(s.cssRules)
    } catch {
      /* cross-origin sheet */
    }
  }
  const cs = doc.defaultView!.getComputedStyle(doc.documentElement)
  const map = new Map<string, string[]>()
  for (const n of names) {
    const v = cs.getPropertyValue(n).trim()
    if (
      !v ||
      /^-?[\d.]+(px|rem|em|%)?$/.test(v) ||
      (v.includes(" ") && !/^(rgb|hsl|oklch|oklab|color)\(/.test(v))
    )
      continue
    const c = parseColor(v)
    if (!c || c.a === 0) continue
    const hex = toHex(c)
    map.set(hex, [...(map.get(hex) ?? []), n])
  }
  // Short names first: --accent before --color-accent before --sidebar-accent
  for (const [k, v] of map)
    map.set(
      k,
      v.sort((a, b) => a.length - b.length)
    )
  return map
}

const px = (v: string) => Math.round(parseFloat(v) * 100) / 100

export function inspect(el: Element, tokens: Map<string, string[]>): Spec {
  const w = el.ownerDocument.defaultView!
  const cs = w.getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const colors: Spec["colors"] = []
  const add = (label: string, value: string) => {
    const c = parseColor(value)
    if (!c || c.a === 0) return
    const hex = toHex(c)
    colors.push({ label, hex, tokens: tokens.get(hex) ?? [] })
  }
  add("color", cs.color)
  add("background", cs.backgroundColor)
  if (parseFloat(cs.borderTopWidth) > 0) add("border", cs.borderTopColor)
  if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0)
    add("outline", cs.outlineColor)

  const hasText = Array.from(el.childNodes).some(
    (n) => n.nodeType === 3 && (n.nodeValue ?? "").trim()
  )
  let contrast: Spec["contrast"]
  if (hasText) {
    const bg = effectiveBackground(el)
    const fg = parseColor(cs.color)
    if (!bg.color || !fg) contrast = { unknown: bg.unknown ?? "unknown" }
    else {
      const solid = fg.a < 1 ? composite(fg, bg.color) : fg
      contrast = {
        ...judgeText(
          solid,
          bg.color,
          parseFloat(cs.fontSize),
          Number(cs.fontWeight) || 400
        ),
        fg: toHex(solid),
        bg: toHex(bg.color),
      }
    }
  }

  return {
    tag: el.tagName.toLowerCase(),
    selector: selectorFor(el),
    role: roleOf(el),
    name: accessibleName(el),
    rect: {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: px(String(r.width)),
      h: px(String(r.height)),
    },
    padding: [
      cs.paddingTop,
      cs.paddingRight,
      cs.paddingBottom,
      cs.paddingLeft,
    ].map(px),
    margin: [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].map(
      px
    ),
    border: [
      cs.borderTopWidth,
      cs.borderRightWidth,
      cs.borderBottomWidth,
      cs.borderLeftWidth,
    ].map(px),
    radius: cs.borderRadius,
    type: hasText
      ? {
          family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
          size: px(cs.fontSize),
          lineHeight: cs.lineHeight,
          weight: cs.fontWeight,
          letterSpacing: cs.letterSpacing,
          transform: cs.textTransform,
        }
      : undefined,
    colors,
    contrast,
    classes: Array.from(el.classList).slice(0, 24),
  }
}

/** "16px · 1rem · 4u" — px, rem at the frame's root size, Tailwind 4px units. */
export function describeLength(v: number, rootPx = 16): string {
  if (!v) return "0"
  const rem = Math.round((v / rootPx) * 1000) / 1000
  const units = v / 4
  return `${v}px · ${rem}rem${Number.isInteger(units) ? ` · ${units}u` : ""}`
}

/** Shortest gap between two boxes on each axis — redline distances. */
export function gaps(a: DOMRect, b: DOMRect) {
  const horizontal =
    b.left >= a.right
      ? b.left - a.right
      : a.left >= b.right
        ? a.left - b.right
        : 0
  const vertical =
    b.top >= a.bottom
      ? b.top - a.bottom
      : a.top >= b.bottom
        ? a.top - b.bottom
        : 0
  return { horizontal: Math.round(horizontal), vertical: Math.round(vertical) }
}
