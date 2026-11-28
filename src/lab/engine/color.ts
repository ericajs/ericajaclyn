// Color math for the lab: parsing, compositing, WCAG 2.x contrast and APCA.
//
// WCAG 2.x relative luminance and contrast ratio:
//   https://www.w3.org/TR/WCAG22/#dfn-relative-luminance (0.04045 threshold)
//   https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
// APCA (SAPC-APCA 0.0.98G-4g constants). APCA is the candidate method for
// WCAG 3 — still a draft, NOT a conformance requirement. Shown as a second
// opinion only: https://github.com/Myndex/apca-w3

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

const HEX = /^#([0-9a-f]{3,8})$/i
const RGB =
  /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i

let ctx: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, RGBA | null>()

/** Parse any CSS color to sRGB 0–255. Falls back to a canvas for oklch(), color-mix() etc. */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase()
  if (cache.has(s)) return cache.get(s)!
  let out: RGBA | null = null
  if (s === "transparent") out = { r: 0, g: 0, b: 0, a: 0 }
  const hex = !out && HEX.exec(s)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("")
    if (h.length === 6 || h.length === 8) {
      out = {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      }
    }
  }
  const rgb = !out && RGB.exec(s)
  if (rgb) {
    const a =
      rgb[4] === undefined
        ? 1
        : rgb[4].endsWith("%")
          ? parseFloat(rgb[4]) / 100
          : parseFloat(rgb[4])
    out = { r: +rgb[1], g: +rgb[2], b: +rgb[3], a }
  }
  if (!out && typeof document !== "undefined") out = viaCanvas(s)
  cache.set(s, out)
  return out
}

function viaCanvas(s: string): RGBA | null {
  if (ctx === undefined) {
    const c = document.createElement("canvas")
    c.width = c.height = 1
    ctx = c.getContext("2d", { willReadFrequently: true })
  }
  if (!ctx) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = "#000"
  ctx.fillStyle = s
  // An invalid color leaves fillStyle unchanged; detect with a second sentinel
  const first = ctx.fillStyle
  ctx.fillStyle = "#fff"
  ctx.fillStyle = s
  if (first === "#000000" && ctx.fillStyle === "#ffffff") return null
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
}

/** Source-over composite of `top` onto an opaque `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  }
}

export function toHex(c: RGBA): string {
  const h = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0")
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a * 255) : ""}`
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(c: RGBA): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

/** WCAG 2.x contrast ratio, 1–21. Both colors must be opaque. */
export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * WCAG "large text": at least 18pt (24px) regular, or 14pt (18.66px) bold.
 * https://www.w3.org/TR/WCAG22/#dfn-large-scale
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700)
}

export interface ContrastVerdict {
  ratio: number
  aa: boolean
  aaa: boolean
  large: boolean
  apca: number
}

export function judgeText(
  fg: RGBA,
  bg: RGBA,
  fontSizePx: number,
  fontWeight: number
): ContrastVerdict {
  const ratio = contrastRatio(fg, bg)
  const large = isLargeText(fontSizePx, fontWeight)
  return {
    ratio,
    large,
    aa: ratio >= (large ? 3 : 4.5),
    aaa: ratio >= (large ? 4.5 : 7),
    apca: apcaLc(fg, bg),
  }
}

/** APCA lightness contrast (Lc), roughly −108…106. Sign = polarity. */
export function apcaLc(text: RGBA, bg: RGBA): number {
  const Y = (c: RGBA) => {
    const y =
      0.2126729 * (c.r / 255) ** 2.4 +
      0.7151522 * (c.g / 255) ** 2.4 +
      0.072175 * (c.b / 255) ** 2.4
    return y < 0.022 ? y + (0.022 - y) ** 1.414 : y
  }
  const yt = Y(text)
  const yb = Y(bg)
  if (Math.abs(yb - yt) < 0.0005) return 0
  if (yb > yt) {
    const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100
  }
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100
}

export function fmtRatio(r: number): string {
  // Truncate, never round up: 4.497 must not display as a passing 4.5
  return `${(Math.floor(r * 100) / 100).toFixed(2)}:1`
}
