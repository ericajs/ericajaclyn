// Analyzers for "analyze" switches. Each reads a same-origin frame document
// and returns findings; the overlay draws the ones that carry an element,
// and the Findings drawer lists all of them. Findings can be promoted to
// evidence on a hypothesis.

import axeUrl from "axe-core/axe.min.js?url"
import { composite, fmtRatio, judgeText, parseColor, type RGBA } from "./color"
import { selectorFor } from "./anchor"

export type Severity = "fail" | "warn" | "info" | "pass"

export interface Finding {
  id: string
  switchId: string
  severity: Severity
  message: string
  wcag?: string[]
  el?: Element
  selector?: string
  /** Short text drawn next to the element in the overlay */
  label?: string
  /** For tab order: sequence number, drawn as a numbered badge + connector */
  order?: number
}

export interface Analysis {
  switchId: string
  summary: string
  findings: Finding[]
  /** Extra structured output, e.g. the heading outline */
  outline?: { level: number; text: string; el: Element }[]
}

let seq = 0
const fid = () => `f${++seq}`

function win(doc: Document): Window & typeof globalThis {
  return doc.defaultView as Window & typeof globalThis
}

/** Has layout boxes and isn't visibility:hidden. Includes sr-only content. */
export function isRendered(el: Element): boolean {
  if (el.getClientRects().length === 0) return false
  return win(el.ownerDocument).getComputedStyle(el).visibility !== "hidden"
}

/** Rendered and actually visible on screen (sr-only 1px clips excluded). */
export function isVisible(el: Element): boolean {
  if (!isRendered(el)) return false
  const r = el.getBoundingClientRect()
  if (r.width < 2 && r.height < 2) return false
  return Number(win(el.ownerDocument).getComputedStyle(el).opacity) > 0
}

/** In the accessibility tree: rendered and not under aria-hidden or inert. */
export function isExposed(el: Element): boolean {
  return isRendered(el) && !el.closest("[aria-hidden='true'], [inert]")
}

function text(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim()
}

function short(s: string, n = 48) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// ── Accessible name (approximate) ────────────────────────────────────────

export function accessibleName(el: Element): string {
  const doc = el.ownerDocument
  const labelledby = el.getAttribute("aria-labelledby")
  if (labelledby) {
    const t = labelledby
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter(Boolean)
      .map((n) => text(n!))
      .join(" ")
      .trim()
    if (t) return t
  }
  const aria = el.getAttribute("aria-label")?.trim()
  if (aria) return aria
  if (
    el instanceof win(doc).HTMLInputElement ||
    el instanceof win(doc).HTMLTextAreaElement ||
    el instanceof win(doc).HTMLSelectElement
  ) {
    const id = el.id
    const lbl =
      (id && doc.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      el.closest("label")
    if (lbl) return text(lbl)
    if (
      el instanceof win(doc).HTMLInputElement &&
      ["submit", "button", "reset"].includes(el.type)
    )
      return el.value
    if (el instanceof win(doc).HTMLInputElement && el.type === "image")
      return el.alt
  }
  if (el instanceof win(doc).HTMLImageElement) return el.alt ?? ""
  // Content: text plus alt of descendant images, minus aria-hidden subtrees
  const parts: string[] = []
  const walk = (n: Node) => {
    if (n.nodeType === 3) parts.push(n.nodeValue ?? "")
    else if (n.nodeType === 1) {
      const e = n as Element
      if (e.getAttribute("aria-hidden") === "true") return
      if (e.tagName === "IMG") parts.push((e as HTMLImageElement).alt ?? "")
      else if (e.tagName.toLowerCase() === "svg") {
        const t = e.querySelector("title")
        if (t) parts.push(text(t))
        else if (e.getAttribute("aria-label"))
          parts.push(e.getAttribute("aria-label")!)
      } else e.childNodes.forEach(walk)
    }
  }
  el.childNodes.forEach(walk)
  const content = parts.join(" ").replace(/\s+/g, " ").trim()
  if (content) return content
  return el.getAttribute("title")?.trim() ?? ""
}

const INTERACTIVE =
  "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [tabindex]:not([tabindex='-1'])"

// ── Individual analyzers ─────────────────────────────────────────────────

function headings(doc: Document): Analysis {
  const els = Array.from(
    doc.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")
  ).filter(isExposed)
  const findings: Finding[] = []
  const outline: Analysis["outline"] = []
  let prev = 0
  let h1 = 0
  for (const el of els) {
    const level = /^H[1-6]$/.test(el.tagName)
      ? Number(el.tagName[1])
      : Number(el.getAttribute("aria-level") ?? 2)
    const t = text(el)
    outline.push({ level, text: t, el })
    if (level === 1) h1++
    let sev: Severity = "pass"
    let msg = `h${level}: ${short(t)}`
    if (!t) {
      sev = "fail"
      msg = `Empty h${level}`
    } else if (prev && level > prev + 1) {
      sev = "warn"
      msg = `Skips from h${prev} to h${level}: ${short(t)}`
    }
    findings.push({
      id: fid(),
      switchId: "headings",
      severity: sev,
      message: msg,
      el,
      label: `H${level}`,
      wcag: ["1.3.1"],
    })
    prev = level
  }
  if (h1 === 0)
    findings.unshift({
      id: fid(),
      switchId: "headings",
      severity: "warn",
      message: "No h1 on this page",
      wcag: ["1.3.1", "2.4.6"],
    })
  if (h1 > 1)
    findings.unshift({
      id: fid(),
      switchId: "headings",
      severity: "warn",
      message: `${h1} h1 elements — usually one per page`,
    })
  const bad = findings.filter((f) => f.severity !== "pass").length
  return {
    switchId: "headings",
    summary: `${els.length} headings, ${bad} issue${bad === 1 ? "" : "s"}`,
    findings,
    outline,
  }
}

const LANDMARK_SEL =
  "header, nav, main, aside, footer, form[aria-label], form[aria-labelledby], section[aria-label], section[aria-labelledby], search, [role=banner], [role=navigation], [role=main], [role=complementary], [role=contentinfo], [role=search], [role=form], [role=region]"

function landmarkRole(el: Element): string | null {
  const role = el.getAttribute("role")
  if (role) return role
  const tag = el.tagName.toLowerCase()
  const sectioning = el.parentElement?.closest(
    "article, aside, main, nav, section"
  )
  switch (tag) {
    case "header":
      return sectioning ? null : "banner"
    case "footer":
      return sectioning ? null : "contentinfo"
    case "nav":
      return "navigation"
    case "main":
      return "main"
    case "aside":
      return "complementary"
    case "search":
      return "search"
    case "form":
      return "form"
    case "section":
      return "region"
  }
  return null
}

function landmarks(doc: Document): Analysis {
  const findings: Finding[] = []
  const byRole = new Map<string, Element[]>()
  for (const el of Array.from(doc.querySelectorAll(LANDMARK_SEL))) {
    const role = landmarkRole(el)
    if (!role || !isExposed(el)) continue
    const name =
      el.getAttribute("aria-label") ??
      (el.getAttribute("aria-labelledby") ? accessibleName(el) : "")
    byRole.set(role, [...(byRole.get(role) ?? []), el])
    findings.push({
      id: fid(),
      switchId: "landmarks",
      severity: "info",
      message: `${role}${name ? ` "${short(name, 32)}"` : ""}`,
      el,
      label: role,
    })
  }
  if (!byRole.has("main"))
    findings.unshift({
      id: fid(),
      switchId: "landmarks",
      severity: "fail",
      message: "No main landmark",
      wcag: ["1.3.1", "2.4.1"],
    })
  for (const [role, els] of byRole) {
    if (
      els.length > 1 &&
      ["navigation", "complementary", "region", "form"].includes(role)
    ) {
      const unnamed = els.filter(
        (e) =>
          !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby")
      )
      if (unnamed.length) {
        findings.unshift({
          id: fid(),
          switchId: "landmarks",
          severity: "warn",
          message: `${els.length} ${role} landmarks, ${unnamed.length} without a label — screen reader users can't tell them apart`,
          el: unnamed[0],
        })
      }
    }
  }
  return {
    switchId: "landmarks",
    summary: `${findings.filter((f) => f.el).length} landmarks`,
    findings,
  }
}

function altText(doc: Document): Analysis {
  const findings: Finding[] = []
  for (const el of Array.from(
    doc.querySelectorAll("img, [role=img], input[type=image], area")
  )) {
    if (!isExposed(el) && el.tagName !== "AREA") continue
    const alt = el.getAttribute("alt")
    const name =
      el.tagName === "IMG" || el.tagName === "INPUT" || el.tagName === "AREA"
        ? alt
        : accessibleName(el)
    let sev: Severity = "pass"
    let msg = `Alt: "${short(name ?? "", 60)}"`
    let label = short(name ?? "", 40)
    if (name === null || name === undefined) {
      sev = "fail"
      msg = "Image has no alt attribute"
      label = "NO ALT"
    } else if (name === "") {
      sev = "info"
      msg = 'Decorative (alt="") — confirm it adds no information'
      label = "decorative"
    } else if (
      /\.(jpe?g|png|gif|webp|avif|svg)$|^(img|image|photo|picture)[\s_-]?\d*$/i.test(
        name
      )
    ) {
      sev = "warn"
      msg = `Alt looks like a filename or placeholder: "${name}"`
    }
    findings.push({
      id: fid(),
      switchId: "alt-text",
      severity: sev,
      message: msg,
      el,
      label,
      wcag: ["1.1.1"],
    })
  }
  const fails = findings.filter((f) => f.severity === "fail").length
  return {
    switchId: "alt-text",
    summary: `${findings.length} images, ${fails} missing alt`,
    findings,
  }
}

function names(doc: Document): Analysis {
  const findings: Finding[] = []
  for (const el of Array.from(doc.querySelectorAll(INTERACTIVE))) {
    if (!isExposed(el)) continue
    const n = accessibleName(el)
    const visible = text(el)
    let sev: Severity = n ? "pass" : "fail"
    let msg = n
      ? `${el.tagName.toLowerCase()}: "${short(n)}"`
      : `${el.tagName.toLowerCase()} has no accessible name`
    // 2.5.3 Label in Name: the visible label should be part of the name
    if (
      n &&
      visible &&
      el.getAttribute("aria-label") &&
      !n.toLowerCase().includes(visible.toLowerCase().slice(0, 24))
    ) {
      sev = "warn"
      msg = `Name "${short(n, 32)}" doesn't contain the visible label "${short(visible, 24)}" (2.5.3)`
    }
    if (n && /^(click here|here|more|read more|link)$/i.test(n)) {
      sev = "warn"
      msg = `Vague link text "${n}" — meaningless out of context (2.4.4)`
    }
    findings.push({
      id: fid(),
      switchId: "names",
      severity: sev,
      message: msg,
      el,
      label: n ? short(n, 28) : "NO NAME",
      wcag: ["4.1.2"],
    })
  }
  const fails = findings.filter((f) => f.severity === "fail").length
  return {
    switchId: "names",
    summary: `${findings.length} controls, ${fails} unnamed`,
    findings,
  }
}

function isInlineLink(el: Element): boolean {
  if (el.tagName !== "A") return false
  const p = el.parentElement
  if (!p) return false
  const cs = win(el.ownerDocument).getComputedStyle(el)
  if (
    !cs.display.startsWith("inline") ||
    cs.display === "inline-flex" ||
    cs.display === "inline-block"
  )
    return false
  return Array.from(p.childNodes).some(
    (n) => n !== el && n.nodeType === 3 && (n.nodeValue ?? "").trim().length > 0
  )
}

function targetSize(doc: Document): Analysis {
  const findings: Finding[] = []
  let small = 0
  for (const el of Array.from(doc.querySelectorAll(INTERACTIVE))) {
    if (!isVisible(el)) continue
    const r = el.getBoundingClientRect()
    const w = Math.round(r.width)
    const h = Math.round(r.height)
    const size = `${w}×${h}`
    if (isInlineLink(el)) {
      findings.push({
        id: fid(),
        switchId: "target-size",
        severity: "info",
        message: `Inline link ${size} — exempt from 2.5.8 (inline exception)`,
        el,
        label: size,
      })
    } else if (w < 24 || h < 24) {
      small++
      findings.push({
        id: fid(),
        switchId: "target-size",
        severity: "fail",
        message: `${short(accessibleName(el) || el.tagName.toLowerCase(), 32)} is ${size} — under 24×24 (2.5.8) unless spacing gives it a 24px circle`,
        el,
        label: size,
        wcag: ["2.5.8"],
      })
    } else if (w < 44 || h < 44) {
      findings.push({
        id: fid(),
        switchId: "target-size",
        severity: "warn",
        message: `${short(accessibleName(el) || el.tagName.toLowerCase(), 32)} is ${size} — meets AA, under 44×44 (2.5.5 AAA, Apple HIG)`,
        el,
        label: size,
        wcag: ["2.5.5"],
      })
    } else {
      findings.push({
        id: fid(),
        switchId: "target-size",
        severity: "pass",
        message: `${short(accessibleName(el) || el.tagName.toLowerCase(), 32)} ${size}`,
        el,
        label: size,
      })
    }
  }
  return {
    switchId: "target-size",
    summary: `${findings.length} targets, ${small} under 24px`,
    findings,
  }
}

const FOCUSABLE =
  "a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), iframe, summary, audio[controls], video[controls], [contenteditable=''], [contenteditable=true], [tabindex]"

export function focusOrder(doc: Document): Element[] {
  const els = Array.from(doc.querySelectorAll(FOCUSABLE)).filter((el) => {
    const ti = el.getAttribute("tabindex")
    if (ti !== null && Number(ti) < 0) return false
    if (el.closest("[inert]")) return false
    // Content of a closed <details> is not focusable, its summary is
    const det = el.closest("details")
    if (det && !det.open && el.tagName !== "SUMMARY") return false
    return isRendered(el)
  })
  const positive = els.filter(
    (e) => Number(e.getAttribute("tabindex") ?? 0) > 0
  )
  positive.sort(
    (a, b) =>
      Number(a.getAttribute("tabindex")) - Number(b.getAttribute("tabindex"))
  )
  return [...positive, ...els.filter((e) => !positive.includes(e))]
}

function tabOrder(doc: Document): Analysis {
  const order = focusOrder(doc)
  const findings: Finding[] = []
  let prevTop = -Infinity
  order.forEach((el, i) => {
    const r = el.getBoundingClientRect()
    const ti = Number(el.getAttribute("tabindex") ?? 0)
    let sev: Severity = "pass"
    let msg = `${i + 1}. ${short(accessibleName(el) || el.tagName.toLowerCase(), 40)}`
    if (ti > 0) {
      sev = "fail"
      msg += ` — tabindex=${ti} overrides DOM order (2.4.3)`
    } else if (r.top < prevTop - 40) {
      sev = "warn"
      msg += " — focus jumps back up the page; check it follows reading order"
    }
    prevTop = r.top
    findings.push({
      id: fid(),
      switchId: "tab-order",
      severity: sev,
      message: msg,
      el,
      order: i + 1,
      wcag: ["2.4.3"],
    })
  })
  return {
    switchId: "tab-order",
    summary: `${order.length} tab stops`,
    findings,
  }
}

// ── Contrast ─────────────────────────────────────────────────────────────

export interface Background {
  color: RGBA | null
  /** Why color is null: text sits over an image, gradient or video */
  unknown?: string
}

const mediaCache = new WeakMap<
  Document,
  { at: number; list: { el: Element; r: DOMRect }[] }
>()

/** Boxes of visible media in the document, cached briefly (one analysis pass). */
function mediaRects(doc: Document): { el: Element; r: DOMRect }[] {
  const hit = mediaCache.get(doc)
  if (hit && performance.now() - hit.at < 500) return hit.list
  const list = Array.from(
    doc.querySelectorAll("img, video, canvas, picture, iframe")
  )
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((m) => m.r.width > 4 && m.r.height > 4)
  mediaCache.set(doc, { at: performance.now(), list })
  return list
}

export function effectiveBackground(el: Element): Background {
  const w = win(el.ownerDocument)
  const layers: RGBA[] = []
  let node: Element | null = el
  while (node) {
    const cs = w.getComputedStyle(node)
    if (cs.backgroundImage && cs.backgroundImage !== "none")
      return { color: null, unknown: "background image or gradient" }
    const c = parseColor(cs.backgroundColor)
    if (c && c.a > 0) {
      layers.push(c)
      if (c.a >= 1) break
    }
    node = node.parentElement
  }
  // Positioned siblings (captions over photos) aren't ancestors. Any image,
  // video or canvas whose box overlaps the text box makes the background
  // unknowable from styles alone. Geometric, so it works below the fold too.
  const r = el.getBoundingClientRect()
  for (const m of mediaRects(el.ownerDocument)) {
    if (m.el.contains(el) || el.contains(m.el)) continue
    const overlap =
      Math.min(r.right, m.r.right) - Math.max(r.left, m.r.left) > 2 &&
      Math.min(r.bottom, m.r.bottom) - Math.max(r.top, m.r.top) > 2
    if (overlap) return { color: null, unknown: "text over an image" }
  }
  let base: RGBA = { r: 255, g: 255, b: 255, a: 1 }
  if (layers.length && layers[layers.length - 1].a >= 1) base = layers.pop()!
  for (let i = layers.length - 1; i >= 0; i--) base = composite(layers[i], base)
  return { color: base }
}

function contrast(doc: Document): Analysis {
  const w = win(doc)
  const findings: Finding[] = []
  const seen = new Set<Element>()
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let checked = 0
  let fails = 0
  let unknown = 0
  while (walker.nextNode() && checked < 600) {
    const t = walker.currentNode as Text
    if (!t.nodeValue?.trim()) continue
    const el = t.parentElement
    if (
      !el ||
      seen.has(el) ||
      /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName)
    )
      continue
    seen.add(el)
    if (!isVisible(el)) continue
    const cs = w.getComputedStyle(el)
    const fg = parseColor(cs.color)
    if (!fg) continue
    checked++
    const bg = effectiveBackground(el)
    const size = parseFloat(cs.fontSize)
    const weight = Number(cs.fontWeight) || 400
    const sample = short(text(el), 36)
    if (!bg.color) {
      unknown++
      findings.push({
        id: fid(),
        switchId: "contrast",
        severity: "warn",
        message: `Can't measure "${sample}" — ${bg.unknown}. Check by eye or sample pixels.`,
        el,
        label: "?",
      })
      continue
    }
    const fgSolid = fg.a < 1 ? composite(fg, bg.color) : fg
    const v = judgeText(fgSolid, bg.color, size, weight)
    const need = v.large ? "3:1" : "4.5:1"
    if (!v.aa) {
      fails++
      findings.push({
        id: fid(),
        switchId: "contrast",
        severity: "fail",
        message: `"${sample}" ${fmtRatio(v.ratio)} — needs ${need}${v.large ? " (large text)" : ""}. APCA Lc ${Math.round(Math.abs(v.apca))}`,
        el,
        label: fmtRatio(v.ratio),
        wcag: ["1.4.3"],
      })
    } else {
      findings.push({
        id: fid(),
        switchId: "contrast",
        severity: "pass",
        message: `"${sample}" ${fmtRatio(v.ratio)}${v.aaa ? " (AAA)" : ""} · APCA Lc ${Math.round(Math.abs(v.apca))}`,
        el,
        label: fmtRatio(v.ratio),
      })
    }
  }
  return {
    switchId: "contrast",
    summary: `${checked} text runs: ${fails} fail AA, ${unknown} unmeasurable`,
    findings,
  }
}

// ── Reflow & clipping ────────────────────────────────────────────────────

function reflow(doc: Document): Analysis {
  const w = win(doc)
  const findings: Finding[] = []
  const root = doc.documentElement
  const vw = root.clientWidth
  const over = root.scrollWidth - vw
  if (over > 1) {
    findings.push({
      id: fid(),
      switchId: "reflow",
      severity: "fail",
      message: `Page scrolls horizontally: content is ${over}px wider than the ${vw}px viewport (1.4.10)`,
      wcag: ["1.4.10"],
    })
  } else {
    findings.push({
      id: fid(),
      switchId: "reflow",
      severity: "pass",
      message: `No horizontal scroll at ${vw}px`,
    })
  }
  const all = Array.from(doc.body.querySelectorAll("*")).slice(0, 4000)
  let offenders = 0
  for (const el of all) {
    if (!isVisible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1 && offenders < 12) {
      // Ignore content inside its own horizontal scroller — that's allowed
      let p = el.parentElement
      let scroller = false
      while (p && p !== doc.body) {
        const ox = w.getComputedStyle(p).overflowX
        if (
          ox === "auto" ||
          ox === "scroll" ||
          ox === "hidden" ||
          ox === "clip"
        ) {
          scroller = true
          break
        }
        p = p.parentElement
      }
      if (!scroller && el.children.length === 0) {
        offenders++
        findings.push({
          id: fid(),
          switchId: "reflow",
          severity: "fail",
          message: `${el.tagName.toLowerCase()} overflows the viewport by ${Math.round(r.right - vw)}px`,
          el,
          label: `+${Math.round(r.right - vw)}px`,
        })
      }
    }
    const cs = w.getComputedStyle(el)
    const clips =
      /hidden|clip/.test(cs.overflowX) ||
      /hidden|clip/.test(cs.overflowY) ||
      cs.textOverflow === "ellipsis"
    if (clips && text(el) && el.clientWidth > 2 && el.clientHeight > 2) {
      const hidden =
        el.scrollWidth > el.clientWidth + 1 ||
        el.scrollHeight > el.clientHeight + 1
      if (hidden && cs.position !== "fixed") {
        findings.push({
          id: fid(),
          switchId: "reflow",
          severity: "warn",
          message: `Text clipped in ${el.tagName.toLowerCase()} "${short(text(el), 32)}" (${el.scrollWidth}×${el.scrollHeight} content in ${el.clientWidth}×${el.clientHeight})`,
          el,
          label: "clipped",
          wcag: ["1.4.12", "1.4.10"],
        })
      }
    }
  }
  const bad = findings.filter((f) => f.severity !== "pass").length
  return {
    switchId: "reflow",
    summary: bad
      ? `${bad} reflow / clipping issues`
      : `Reflows cleanly at ${vw}px`,
    findings,
  }
}

// ── Reading level ────────────────────────────────────────────────────────

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (!w) return 0
  if (w.length <= 3) return 1
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups?.length ?? 1)
}

export function fleschKincaid(s: string): { grade: number; words: number } {
  const sentences = Math.max(1, (s.match(/[.!?]+(\s|$)/g) ?? []).length)
  const words = s.match(/[A-Za-z][A-Za-z'-]*/g) ?? []
  if (words.length === 0) return { grade: 0, words: 0 }
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  return {
    grade:
      0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59,
    words: words.length,
  }
}

function readingLevel(doc: Document): Analysis {
  const findings: Finding[] = []
  const blocks = Array.from(
    doc.querySelectorAll("p, li, dd, blockquote, figcaption, td")
  ).filter(isVisible)
  let all = ""
  for (const el of blocks) {
    const t = text(el)
    if (t.split(" ").length < 12) continue
    all += ` ${t}${/[.!?]$/.test(t) ? "" : "."}`
    const { grade } = fleschKincaid(t)
    if (grade > 12)
      findings.push({
        id: fid(),
        switchId: "reading-level",
        severity: "warn",
        message: `Grade ${grade.toFixed(1)}: "${short(t, 50)}"`,
        el,
        label: `G${Math.round(grade)}`,
      })
    else if (grade > 9)
      findings.push({
        id: fid(),
        switchId: "reading-level",
        severity: "info",
        message: `Grade ${grade.toFixed(1)}: "${short(t, 50)}"`,
        el,
        label: `G${Math.round(grade)}`,
      })
  }
  const page = fleschKincaid(all)
  findings.unshift({
    id: fid(),
    switchId: "reading-level",
    severity: page.grade > 9 ? "warn" : "pass",
    message: `Page body copy: grade ${page.grade.toFixed(1)} over ${page.words} words${page.grade > 9 ? " — above lower secondary (3.1.5 AAA)" : ""}`,
    wcag: ["3.1.5"],
  })
  return {
    switchId: "reading-level",
    summary: `Grade ${page.grade.toFixed(1)}`,
    findings,
  }
}

// ── Media feature support ────────────────────────────────────────────────

function mediaFeatures(doc: Document): Analysis {
  const counts: Record<string, number> = {
    "prefers-reduced-motion": 0,
    "prefers-color-scheme": 0,
    "prefers-contrast": 0,
    "forced-colors": 0,
    "pointer/hover": 0,
  }
  let animated = 0
  let unreadable = 0
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const cond =
        (rule as CSSConditionRule).conditionText ??
        (rule as CSSMediaRule).media?.mediaText ??
        ""
      if (cond) {
        if (cond.includes("prefers-reduced-motion"))
          counts["prefers-reduced-motion"]++
        if (cond.includes("prefers-color-scheme"))
          counts["prefers-color-scheme"]++
        if (cond.includes("prefers-contrast")) counts["prefers-contrast"]++
        if (cond.includes("forced-colors")) counts["forced-colors"]++
        if (/\((any-)?(pointer|hover)\b/.test(cond)) counts["pointer/hover"]++
      }
      const style = (rule as CSSStyleRule).style
      if (
        style &&
        ((style.animationName && style.animationName !== "none") ||
          (style.transitionDuration &&
            !/^0s?(,\s*0s?)*$/.test(style.transitionDuration)))
      ) {
        animated++
      }
      const inner = (rule as CSSGroupingRule).cssRules
      if (inner) visit(inner)
    }
  }
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      visit(sheet.cssRules)
    } catch {
      unreadable++
    }
  }
  const findings: Finding[] = Object.entries(counts).map(([k, n]) => ({
    id: fid(),
    switchId: "media-features",
    severity: (n === 0 &&
    (k === "prefers-reduced-motion" ? animated > 0 : k === "forced-colors")
      ? "warn"
      : "info") as Severity,
    message: `${k}: ${n} rule${n === 1 ? "" : "s"}${k === "prefers-reduced-motion" ? ` (${animated} rules animate or transition)` : ""}`,
  }))
  if (unreadable)
    findings.push({
      id: fid(),
      switchId: "media-features",
      severity: "info",
      message: `${unreadable} cross-origin stylesheet(s) could not be read (e.g. web fonts)`,
    })
  return {
    switchId: "media-features",
    summary: `${counts["prefers-reduced-motion"]} reduced-motion rules, ${animated} animated`,
    findings,
  }
}

// ── axe-core ─────────────────────────────────────────────────────────────

interface AxeNode {
  target: string[]
  failureSummary?: string
}
interface AxeResult {
  id: string
  impact?: string
  help: string
  helpUrl: string
  tags: string[]
  nodes: AxeNode[]
}

async function loadAxe(
  doc: Document
): Promise<{
  run: (
    ctx: unknown,
    opts: unknown
  ) => Promise<{
    violations: AxeResult[]
    incomplete: AxeResult[]
    passes: AxeResult[]
  }>
}> {
  const w = win(doc) as unknown as { axe?: never }
  if (w.axe) return w.axe
  await new Promise<void>((resolve, reject) => {
    const s = doc.createElement("script")
    s.src = axeUrl
    s.setAttribute("data-lab-ui", "")
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("axe-core failed to load"))
    ;(doc.head ?? doc.documentElement).appendChild(s)
  })
  return (win(doc) as unknown as { axe: never }).axe
}

export async function runAxe(doc: Document, preset: string): Promise<Analysis> {
  const tags =
    preset === "wcag21aa"
      ? ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
      : preset === "best-practice"
        ? [
            "wcag2a",
            "wcag2aa",
            "wcag21a",
            "wcag21aa",
            "wcag22aa",
            "best-practice",
          ]
        : ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
  const axe = await loadAxe(doc)
  const res = await axe.run(doc, {
    runOnly: { type: "tag", values: tags },
    resultTypes: ["violations", "incomplete"],
  })
  const findings: Finding[] = []
  const wcagOf = (r: AxeResult) =>
    r.tags
      .filter((t) => /^wcag\d{3,4}$/.test(t))
      .map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, "$1.$2.$3"))
  for (const v of res.violations) {
    for (const n of v.nodes) {
      const sel = n.target[0]
      let el: Element | undefined
      try {
        el = doc.querySelector(sel) ?? undefined
      } catch {
        el = undefined
      }
      findings.push({
        id: fid(),
        switchId: "axe",
        severity:
          v.impact === "critical" || v.impact === "serious" ? "fail" : "warn",
        message: `${v.help} [${v.id}, ${v.impact}]`,
        el,
        selector: sel,
        label: v.id,
        wcag: wcagOf(v),
      })
    }
  }
  for (const v of res.incomplete) {
    findings.push({
      id: fid(),
      switchId: "axe",
      severity: "info",
      message: `Needs review: ${v.help} (${v.nodes.length}) [${v.id}]`,
      wcag: wcagOf(v),
    })
  }
  const nodes = res.violations.reduce((n, v) => n + v.nodes.length, 0)
  return {
    switchId: "axe",
    summary: `${res.violations.length} rules violated on ${nodes} elements, ${res.incomplete.length} need review`,
    findings,
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────

const SYNC: Record<string, (doc: Document) => Analysis> = {
  headings,
  landmarks,
  "alt-text": altText,
  names,
  "target-size": targetSize,
  "tab-order": tabOrder,
  contrast,
  reflow,
  "reading-level": readingLevel,
  "media-features": mediaFeatures,
}

export const ANALYZERS = new Set([...Object.keys(SYNC), "axe"])

export async function analyze(
  doc: Document,
  switchId: string,
  value: string
): Promise<Analysis | null> {
  if (!doc.body) return null
  if (switchId === "axe") return runAxe(doc, value)
  const fn = SYNC[switchId]
  return fn ? fn(doc) : null
}

export function findingSelector(f: Finding): string | undefined {
  if (f.selector) return f.selector
  if (f.el) return selectorFor(f.el)
  return undefined
}
