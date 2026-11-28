// One tooltip layer for the whole app. Any element with a `title` (or
// `data-tip`) gets the lab tooltip instead of the browser's native one: a dark
// rounded bubble with an arrow, placed above the element and flipped below,
// left or right when there isn't room (`data-tip-side` forces a side).
//
// Accessibility (WCAG 1.4.13): shows on hover after a short delay and at
// once on keyboard focus; stays while the pointer is over the element or the
// bubble; Escape dismisses it. While shown, the native title is parked in
// data-tip so the browser doesn't draw its own tooltip on top; an element
// whose only name was its title gets it as aria-label so it keeps a name.
//
// Required for unlabeled controls: a button, dropdown, link or slider with no
// visible label (an icon button, a select showing only its value like "P2")
// shows its accessible name as the tooltip automatically, even without a
// title. In dev, controls with no name at all are logged as warnings.

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type Side = "top" | "bottom" | "left" | "right"
const SIDES: Side[] = ["top", "bottom", "right", "left"]
const GAP = 10
const MARGIN = 8
const DELAY = 350

interface Tip {
  el: HTMLElement
  text: string
}

const CONTROLS =
  'button, select, a[href], summary, [role="button"], input[type="range"]'

/** Text a person can actually see, ignoring screen-reader-only and hidden parts */
function visibleText(node: Element): string {
  const clone = node.cloneNode(true) as Element
  clone
    .querySelectorAll('.sr-only, [aria-hidden="true"], select, option, input')
    .forEach((n) => n.remove())
  return clone.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

/** Does this control have a label a sighted person can read? */
function hasVisibleLabel(el: HTMLElement): boolean {
  if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement)
    return [...(el.labels ?? [])].some((l) => visibleText(l) !== "")
  return visibleText(el) !== ""
}

/** The control's accessible name, for the automatic tooltip */
function accessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute("aria-labelledby")
  if (labelledBy)
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim()
  return el.getAttribute("aria-label")?.trim() ?? ""
}

function tipText(el: HTMLElement): string {
  const title = el.getAttribute("title")
  if (title) {
    el.dataset.tip = title
    el.removeAttribute("title")
    if (
      !el.hasAttribute("aria-label") &&
      !el.hasAttribute("aria-labelledby") &&
      !el.textContent?.trim()
    )
      el.setAttribute("aria-label", title)
  }
  if (el.dataset.tip) return el.dataset.tip
  return el.matches(CONTROLS) && !hasVisibleLabel(el) ? accessibleName(el) : ""
}

function findTipTarget(node: EventTarget | null): HTMLElement | null {
  const el = node instanceof Element ? node : null
  if (!el) return null
  const explicit = el.closest("[title], [data-tip]") as HTMLElement | null
  if (explicit) return explicit
  const control = el.closest(CONTROLS) as HTMLElement | null
  return control && !hasVisibleLabel(control) && accessibleName(control)
    ? control
    : null
}

/** Dev only: controls nobody can identify (no visible label, no name, no tip) */
function auditUnlabeled(root: ParentNode, seen: Set<Element>) {
  root.querySelectorAll<HTMLElement>(CONTROLS).forEach((el) => {
    if (seen.has(el) || el.closest(".lab-tooltip")) return
    if (hasVisibleLabel(el) || accessibleName(el) || tipText(el)) return
    seen.add(el)
    console.warn(
      "[AI Design Lab] Control has no visible label and no tooltip. Give it an aria-label or data-tip:",
      el
    )
  })
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<number | undefined>(undefined)
  // Latest tip for the document listeners without re-subscribing them
  const tipRef = useRef<Tip | null>(null)
  useEffect(() => {
    tipRef.current = tip
  })
  const bubble = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    x: number
    y: number
    side: Side
    arrow: number
  } | null>(null)

  // Dev: warn about unlabeled controls as the UI changes
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const seen = new Set<Element>()
    let t: number | undefined
    const run = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => auditUnlabeled(document, seen), 500)
    }
    const mo = new MutationObserver(run)
    mo.observe(document.body, { childList: true, subtree: true })
    run()
    return () => {
      mo.disconnect()
      window.clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    const show = (el: HTMLElement, now: boolean) => {
      const text = tipText(el)
      if (!text) return
      window.clearTimeout(timer.current)
      if (now) setTip({ el, text })
      else timer.current = window.setTimeout(() => setTip({ el, text }), DELAY)
    }
    const hide = () => {
      window.clearTimeout(timer.current)
      setTip(null)
    }
    const over = (e: PointerEvent) => {
      if (bubble.current?.contains(e.target as Node)) return
      const el = findTipTarget(e.target)
      if (el) {
        if (el !== tipRef.current?.el) show(el, false)
      } else hide()
    }
    const focus = (e: FocusEvent) => {
      const el = findTipTarget(e.target)
      if (el && (e.target as Element).matches?.(":focus-visible"))
        show(el, true)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tipRef.current) hide()
    }
    const leaveWindow = (e: PointerEvent) => {
      if (!e.relatedTarget) hide()
    }
    document.addEventListener("pointerover", over)
    document.addEventListener("pointerout", leaveWindow)
    document.addEventListener("focusin", focus)
    document.addEventListener("focusout", hide)
    document.addEventListener("keydown", key, true)
    document.addEventListener("pointerdown", hide)
    window.addEventListener("scroll", hide, true)
    return () => {
      document.removeEventListener("pointerover", over)
      document.removeEventListener("pointerout", leaveWindow)
      document.removeEventListener("focusin", focus)
      document.removeEventListener("focusout", hide)
      document.removeEventListener("keydown", key, true)
      document.removeEventListener("pointerdown", hide)
      window.removeEventListener("scroll", hide, true)
      window.clearTimeout(timer.current)
    }
  }, [])

  // Place it: first side that fits, then clamp into the viewport
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return setPos(null)
    const r = tip.el.getBoundingClientRect()
    const b = bubble.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const forced = tip.el.dataset.tipSide as Side | undefined
    const fits: Record<Side, boolean> = {
      top: r.top - b.height - GAP >= MARGIN,
      bottom: r.bottom + b.height + GAP <= vh - MARGIN,
      right: r.right + b.width + GAP <= vw - MARGIN,
      left: r.left - b.width - GAP >= MARGIN,
    }
    const side =
      forced && SIDES.includes(forced)
        ? forced
        : (SIDES.find((s) => fits[s]) ?? "top")
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(Math.max(v, lo), Math.max(lo, hi))
    let x: number
    let y: number
    let arrow: number
    if (side === "top" || side === "bottom") {
      const cx = r.left + r.width / 2
      x = clamp(cx - b.width / 2, MARGIN, vw - MARGIN - b.width)
      y = side === "top" ? r.top - b.height - GAP : r.bottom + GAP
      arrow = clamp(cx - x, 12, b.width - 12)
    } else {
      const cy = r.top + r.height / 2
      y = clamp(cy - b.height / 2, MARGIN, vh - MARGIN - b.height)
      x = side === "left" ? r.left - b.width - GAP : r.right + GAP
      arrow = clamp(cy - y, 10, b.height - 10)
    }
    setPos({ x, y, side, arrow })
  }, [tip])

  if (!tip) return null
  // Inside a modal, render in the dialog: the top layer would cover the body
  const host =
    (tip.el.closest("dialog[open]") as HTMLElement | null) ?? document.body
  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      className={`lab-tooltip ${pos ? `side-${pos.side}` : ""}`}
      style={{
        left: pos?.x ?? -9999,
        top: pos?.y ?? -9999,
        ["--arrow" as string]: `${pos?.arrow ?? 0}px`,
      }}
      onPointerLeave={(e) => {
        if (!tip.el.contains(e.relatedTarget as Node)) setTip(null)
      }}
    >
      {tip.text}
    </div>,
    host
  )
}
