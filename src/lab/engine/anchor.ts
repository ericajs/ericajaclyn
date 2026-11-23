// Anchoring: annotations attach to DOM elements, not to pixels, so a pin on a
// button stays on that button at 320px and at 1440px. Raw document
// coordinates are kept as the fallback for cross-origin frames and images.

import type { AnchoredPoint } from "../types"

const STABLE_ATTRS = [
  "data-testid",
  "data-slot",
  "data-lab-id",
  "aria-label",
  "name",
  "for",
]

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(s)
    : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

/**
 * A selector that uniquely identifies `el`. Prefers a path rooted at the
 * nearest ancestor with an id (stable against changes elsewhere in the page);
 * otherwise the shortest unique path.
 */
export function selectorFor(el: Element): string {
  const doc = el.ownerDocument
  const unique = (sel: string) => {
    try {
      return doc.querySelectorAll(sel).length === 1
    } catch {
      return false
    }
  }
  if (el.id && unique(`#${cssEscape(el.id)}`)) return `#${cssEscape(el.id)}`

  const parts: string[] = []
  let shortest: string | null = null
  let node: Element | null = el
  let depth = 0
  while (
    node &&
    node.nodeType === 1 &&
    node !== doc.documentElement &&
    depth < 10
  ) {
    let part = node.tagName.toLowerCase()
    if (node.id && unique(`#${cssEscape(node.id)}`)) {
      const rooted = [`#${cssEscape(node.id)}`, ...parts].join(" > ")
      if (unique(rooted)) return rooted
      break
    }
    const attr = STABLE_ATTRS.find((a) => node!.getAttribute(a))
    if (attr) part += `[${attr}="${cssEscape(node.getAttribute(attr)!)}"]`
    const parent: Element | null = node.parentElement
    if (parent) {
      const same = Array.from(parent.children).filter(
        (c) => c.tagName === node!.tagName
      )
      if (same.length > 1 && !attr)
        part += `:nth-of-type(${same.indexOf(node) + 1})`
    }
    parts.unshift(part)
    const sel = parts.join(" > ")
    if (!shortest && unique(sel)) shortest = sel
    node = parent
    depth++
  }
  return shortest ?? parts.join(" > ")
}

/** Create a point from viewport coordinates inside the frame. */
export function anchorAt(
  doc: Document | null,
  vx: number,
  vy: number,
  scrollX = 0,
  scrollY = 0
): AnchoredPoint {
  const point: AnchoredPoint = { x: vx + scrollX, y: vy + scrollY }
  if (!doc) return point
  const el = doc.elementFromPoint(vx, vy)
  if (!el || el === doc.documentElement || el === doc.body) return point
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return point
  point.anchor = {
    selector: selectorFor(el),
    fx: +((vx - r.left) / r.width).toFixed(4),
    fy: +((vy - r.top) / r.height).toFixed(4),
  }
  return point
}

export interface ResolvedPoint {
  x: number
  y: number
  /** true when the point had an anchor but its element is gone (raw fallback used) */
  detached: boolean
}

function safeQuery(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector)
  } catch {
    return null
  }
}

/** Resolve to frame viewport coordinates. */
export function resolvePoint(
  doc: Document | null,
  p: AnchoredPoint,
  scrollX = 0,
  scrollY = 0
): ResolvedPoint {
  if (doc && p.anchor) {
    const el = safeQuery(doc, p.anchor.selector)
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.width || r.height) {
        return {
          x: r.left + p.anchor.fx * r.width,
          y: r.top + p.anchor.fy * r.height,
          detached: false,
        }
      }
    }
  }
  return { x: p.x - scrollX, y: p.y - scrollY, detached: !!p.anchor }
}
