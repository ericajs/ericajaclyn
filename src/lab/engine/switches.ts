// Switch behaviors. Metadata lives in registry/switches.json; this file
// turns a SwitchState into (a) a CSS filter for the <iframe> element, which
// works on any origin, and (b) styles, attributes and DOM transforms applied
// inside a same-origin frame document.

import catalog from "../registry/switches.json"
import type { DesignToggle, Project, SwitchState } from "../types"

export type SwitchKind = "simulate" | "analyze" | "guide"

export interface SwitchOption {
  value: string
  label: string
}

export interface SwitchDef {
  id: string
  label: string
  group: string
  kind: SwitchKind
  sameOrigin: boolean
  description: string
  wcag?: string[]
  options?: SwitchOption[]
  sources?: { label: string; url: string }[]
  guide?: string[]
  /** Set for project-defined design toggles */
  toggle?: DesignToggle
}

export const GROUPS: { id: string; label: string }[] = catalog.groups
const BUILT_INS = catalog.switches as SwitchDef[]

export function switchCatalog(project?: Project): SwitchDef[] {
  const toggles: SwitchDef[] = (project?.toggles ?? []).map((t) => ({
    id: `dt.${t.id}`,
    label: t.label,
    group: "design",
    kind: "simulate",
    sameOrigin: true,
    description: t.description ?? "Project design toggle.",
    options: t.options.map((o) => ({ value: o.value, label: o.label })),
    toggle: t,
  }))
  return [...BUILT_INS, ...toggles]
}

export function findSwitch(
  id: string,
  project?: Project
): SwitchDef | undefined {
  return switchCatalog(project).find((s) => s.id === id)
}

export function optionLabel(def: SwitchDef | undefined, value: string): string {
  if (!def) return value
  if (!def.options) return "on"
  return def.options.find((o) => o.value === value)?.label ?? value
}

// ── (a) Element-level filters: work cross-origin ─────────────────────────

/**
 * Machado, Oliveira & Fernandes 2009, severity 1.0. Rows are R, G, B outputs.
 * Applied by feColorMatrix, which runs in linearRGB by default
 * (color-interpolation-filters), as the model requires.
 */
export const CVD_MATRICES: Record<string, number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882,
    -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182,
    0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733,
    0.691367, 0.3039,
  ],
  achromatopsia: [
    0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722,
  ],
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const lerp = (m: number[], t: number) =>
  m.map((v, i) => IDENTITY[i] + (v - IDENTITY[i]) * t)
CVD_MATRICES.protanomaly = lerp(CVD_MATRICES.protanopia, 0.6)
CVD_MATRICES.deuteranomaly = lerp(CVD_MATRICES.deuteranopia, 0.6)
CVD_MATRICES.tritanomaly = lerp(CVD_MATRICES.tritanopia, 0.6)

/** "a b c 0 0  d e f 0 0  g h i 0 0  0 0 0 1 0" for feColorMatrix */
export function feMatrix(m3: number[]): string {
  const [a, b, c, d, e, f, g, h, i] = m3
  return `${a} ${b} ${c} 0 0 ${d} ${e} ${f} 0 0 ${g} ${h} ${i} 0 0 0 0 0 1 0`
}

export function frameFilter(state: SwitchState): string {
  const parts: string[] = []
  if (state.cvd && CVD_MATRICES[state.cvd])
    parts.push(`url(#lab-cvd-${state.cvd})`)
  if (state.acuity) parts.push(`blur(${Number(state.acuity)}px)`)
  if (state.glare === "mild") parts.push("contrast(0.75) brightness(1.08)")
  if (state.glare === "severe") parts.push("contrast(0.5) brightness(1.15)")
  if (state.grayscale) parts.push("grayscale(1)")
  if (state.squint) parts.push("blur(6px) contrast(0.85)")
  return parts.join(" ")
}

// ── (b) Same-origin document changes ─────────────────────────────────────

const STYLE_ID = "lab-switch-style"
const TEXT_SKIP = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "CODE",
  "PRE",
  "SVG",
  "TITLE",
])

interface DocMemory {
  dark: boolean
  dir: string | null
  colorScheme: string
  text: Map<Text, string>
  images: {
    el: HTMLImageElement | HTMLSourceElement
    src: string | null
    srcset: string | null
  }[]
  keyboardBlock?: (e: Event) => void
}
const memory = new WeakMap<Document, DocMemory>()

/** Frames where the Inspect tool owns clicks; the keyboard-only blocker lets those through. */
export const inspectingDocs = new WeakSet<Document>()

function remember(doc: Document): DocMemory {
  let m = memory.get(doc)
  if (!m) {
    const root = doc.documentElement
    m = {
      dark: root.classList.contains("dark"),
      dir: root.getAttribute("dir"),
      colorScheme: root.style.colorScheme,
      text: new Map(),
      images: [],
    }
    memory.set(doc, m)
  }
  return m
}

function cssFor(state: SwitchState, project?: Project): string {
  // Astro's dev toolbar would otherwise sit inside every frame in `astro dev`
  const css: string[] = ["astro-dev-toolbar{display:none!important}"]
  if (state["text-spacing"]) {
    // Steve Faulkner's text-spacing bookmarklet values = the 1.4.12 metrics
    css.push(
      `*:not([data-lab-ui]){line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}` +
        `p:not([data-lab-ui]){margin-bottom:2em!important}`
    )
  }
  if (state["root-text"])
    css.push(`html{font-size:${Number(state["root-text"])}%!important}`)
  if (state["motion-off"]) {
    css.push(
      `*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;` +
        `transition-duration:.01ms!important;animation-delay:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}`
    )
  }
  if (state["keyboard-only"])
    css.push(`html,html *{cursor:not-allowed!important}`)
  if (state.outlines)
    css.push(
      `*:not([data-lab-ui]){outline:1px solid rgb(255 0 128 / .45)!important;outline-offset:-1px!important}`
    )
  if (state["images-off"])
    css.push(
      `*{background-image:none!important}img{outline:1px dashed currentColor!important}`
    )
  for (const t of project?.toggles ?? []) {
    const v = state[`dt.${t.id}`]
    if (!v) continue
    const opt = t.options.find((o) => o.value === v)
    if (!opt) continue
    const decl = (vars: Record<string, string>) =>
      Object.entries(vars)
        .map(([k, val]) => `${k}:${val}`)
        .join(";")
    if (opt.vars) css.push(`:root:root{${decl(opt.vars)}}`)
    if (opt.varsDark) css.push(`:root.dark{${decl(opt.varsDark)}}`)
    if (opt.css) css.push(opt.css)
  }
  return css.join("\n")
}

export interface ApplyReport {
  applied: string[]
  skipped: { id: string; reason: string }[]
}

/** Apply every switch that needs DOM access. Idempotent: call on every change and on load. */
export function applyToDocument(
  doc: Document,
  state: SwitchState,
  project?: Project
): ApplyReport {
  const m = remember(doc)
  const root = doc.documentElement
  const report: ApplyReport = { applied: [], skipped: [] }

  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement("style")
    style.id = STYLE_ID
    style.setAttribute("data-lab-ui", "")
  }
  // Re-append so it stays last in <head> and wins ties in the cascade
  ;(doc.head ?? root).appendChild(style)
  style.textContent = cssFor(state, project)

  // Theme
  const dark = state.theme ? state.theme === "dark" : m.dark
  root.classList.toggle("dark", dark)
  root.style.colorScheme = state.theme ? state.theme : m.colorScheme

  // Direction
  if (state.rtl) root.setAttribute("dir", "rtl")
  else if (m.dir === null) root.removeAttribute("dir")
  else root.setAttribute("dir", m.dir)

  // Keyboard only: block pointer input in the capture phase. CSS
  // pointer-events:none would also hide elements from elementsFromPoint,
  // which the contrast check relies on.
  if (state["keyboard-only"] && !m.keyboardBlock) {
    const block = (e: Event) => {
      if (inspectingDocs.has(doc)) return
      // Enter/Space on a link or button fires a synthetic click with detail 0;
      // that's keyboard activation and must go through
      // (duck-typed: the event comes from the frame's realm, so instanceof against
      // this window's MouseEvent would always be false)
      if (
        e.type !== "mousedown" &&
        e.type !== "pointerdown" &&
        (e as MouseEvent).detail === 0
      )
        return
      e.preventDefault()
      e.stopPropagation()
    }
    for (const t of [
      "pointerdown",
      "mousedown",
      "click",
      "dblclick",
      "contextmenu",
      "auxclick",
    ]) {
      doc.addEventListener(t, block, true)
    }
    m.keyboardBlock = block
  } else if (!state["keyboard-only"] && m.keyboardBlock) {
    for (const t of [
      "pointerdown",
      "mousedown",
      "click",
      "dblclick",
      "contextmenu",
      "auxclick",
    ]) {
      doc.removeEventListener(t, m.keyboardBlock, true)
    }
    m.keyboardBlock = undefined
  }

  restoreText(m)
  if (state["pseudo-loc"]) pseudoLocalize(doc, m, state["pseudo-loc"])

  restoreImages(m)
  if (state["images-off"]) imagesOff(doc, m)

  for (const [id] of Object.entries(state)) report.applied.push(id)
  return report
}

/** Switch ids in `state` that cannot apply to a cross-origin frame. */
export function unsupportedCrossOrigin(
  state: SwitchState,
  project?: Project
): string[] {
  const cat = switchCatalog(project)
  return Object.keys(state).filter(
    (id) => cat.find((s) => s.id === id)?.sameOrigin
  )
}

// ── Pseudo-localization ──────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  a: "å",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "î",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ö",
  p: "þ",
  q: "ǫ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "ü",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Å",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Î",
  J: "Ĵ",
  K: "Ķ",
  L: "Ļ",
  M: "Ṁ",
  N: "Ñ",
  O: "Ö",
  P: "Þ",
  Q: "Ǫ",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Ü",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
}
const accent = (s: string) => s.replace(/[a-z]/gi, (c) => ACCENTS[c] ?? c)

export function pseudoText(s: string, mode: string): string {
  const lead = s.match(/^\s*/)![0]
  const trail = s.match(/\s*$/)![0]
  const core = s.trim()
  if (!core) return s
  let out = core
  if (mode === "accents") out = accent(core)
  if (mode === "expand") {
    const pad = Math.max(2, Math.ceil(core.length * 0.4))
    // Brackets reveal truncation: if you can't see ⟧, the text was cut off
    out = `⟦${accent(core)} ${"·".repeat(Math.max(1, pad - 3))}⟧`
  }
  if (mode === "long-words") {
    out = core.replace(
      /\b([A-Za-z]{4,})\b/g,
      (w) => `${w}${w.toLowerCase()}verwaltung`
    )
  }
  return lead + out + trail
}

function pseudoLocalize(doc: Document, m: DocMemory, mode: string) {
  if (!doc.body) return
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement
      if (
        !p ||
        TEXT_SKIP.has(p.tagName.toUpperCase()) ||
        p.closest("[data-lab-ui]")
      )
        return NodeFilter.FILTER_REJECT
      return n.nodeValue && n.nodeValue.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    },
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const t of nodes) {
    m.text.set(t, t.nodeValue ?? "")
    t.nodeValue = pseudoText(t.nodeValue ?? "", mode)
  }
}

function restoreText(m: DocMemory) {
  for (const [node, value] of m.text) node.nodeValue = value
  m.text.clear()
}

// ── Images off: make images fail the way a real network failure does, so
// the browser renders alt text exactly as a user would see it.

function imagesOff(doc: Document, m: DocMemory) {
  doc
    .querySelectorAll<
      HTMLImageElement | HTMLSourceElement
    >("img, picture source")
    .forEach((el) => {
      m.images.push({
        el,
        src: el.getAttribute("src"),
        srcset: el.getAttribute("srcset"),
      })
      el.removeAttribute("srcset")
      // tagName, not instanceof: frame elements belong to another realm
      if (el.tagName === "IMG") el.setAttribute("src", "data:,")
    })
}

function restoreImages(m: DocMemory) {
  for (const { el, src, srcset } of m.images) {
    if (src === null) el.removeAttribute("src")
    else el.setAttribute("src", src)
    if (srcset !== null) el.setAttribute("srcset", srcset)
  }
  m.images = []
}

// ── Helpers for presets ──────────────────────────────────────────────────

export function diffSwitches(current: SwitchState, preset: SwitchState) {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  for (const k of Object.keys(current)) {
    if (!(k in preset)) added.push(k)
    else if (preset[k] !== current[k]) changed.push(k)
  }
  for (const k of Object.keys(preset)) if (!(k in current)) removed.push(k)
  return {
    added,
    removed,
    changed,
    deviates: added.length + removed.length + changed.length > 0,
  }
}
