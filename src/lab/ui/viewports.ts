import type { ViewportSpec } from "../types"

export const VIEWPORTS: { label: string; w: number; h: number }[] = [
  { label: "320 · small phone", w: 320, h: 568 },
  { label: "375 · iPhone SE", w: 375, h: 667 },
  { label: "390 · iPhone 15", w: 390, h: 844 },
  { label: "768 · iPad portrait", w: 768, h: 1024 },
  { label: "1024 · iPad landscape", w: 1024, h: 768 },
  { label: "1280 · laptop", w: 1280, h: 800 },
  { label: "1440 · desktop", w: 1440, h: 900 },
  { label: "1920 · full HD", w: 1920, h: 1080 },
]

/** 400% at 1280 = 320 CSS px, the WCAG 1.4.10 reflow test. */
export const ZOOMS = [1, 1.25, 1.5, 2, 3, 4]

export function vpLabel(v: ViewportSpec): string {
  const z =
    v.zoom !== 1
      ? ` @ ${Math.round(v.zoom * 100)}% (${Math.round(v.w / v.zoom)} CSS px)`
      : ""
  return `${v.w}×${v.h}${z}`
}

export function parseVp(s: string): ViewportSpec | null {
  const m = /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(s)
  return m ? { w: +m[1], h: +m[2], zoom: m[3] ? +m[3] : 1 } : null
}
