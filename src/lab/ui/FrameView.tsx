// One rendered design: a page, a component permutation, production, or an
// image — at an exact CSS viewport and zoom, with switches applied and
// overlays drawn on top. Everything else in the canvas is built from this.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  ANALYZERS,
  analyze,
  type Analysis,
  type Finding,
} from "../engine/analyze"
import { anchorAt, resolvePoint } from "../engine/anchor"
import { gaps, inspect, tokenIndex } from "../engine/inspect"
import { frameDocument, rewriteForProxy } from "../engine/proxy"
import {
  applyToDocument,
  frameFilter,
  inspectingDocs,
  unsupportedCrossOrigin,
} from "../engine/switches"
import { store, uid, useLab } from "../store/store"
import type {
  AnchoredPoint,
  Annotation,
  Project,
  SwitchState,
  ViewportSpec,
} from "../types"
import { AnnotationCard } from "./AnnotationCard"
import { dropFrame, inspected, patchFrame } from "./bus"

export type FrameSource =
  | { kind: "url"; url: string }
  /** Production through the same-origin proxy, rendered via srcdoc so switches can reach it */
  | { kind: "proxy"; path: string; prefix: string; fallback: string }
  | { kind: "image"; url: string }

export interface FrameViewProps {
  frameKey: string
  label: string
  source: FrameSource
  viewport: ViewportSpec
  switches: SwitchState
  box: { w: number; h: number }
  project: Project
  /** Target id annotations belong to. Omit to hide annotations. */
  annotationsTarget?: string
  /** Enable inspect / annotation tools */
  tools?: boolean
  analyzeSwitches?: boolean
  compact?: boolean
  reloadKey?: number
  frameStyle?: CSSProperties
  /** Compare: scroll sync */
  scrollY?: number
  onScrollY?: (y: number) => void
  onAnalyses?: (a: Record<string, Analysis>) => void
}

const SEV_COLOR: Record<string, string> = {
  fail: "var(--lab-fail)",
  warn: "var(--lab-warn)",
  info: "var(--lab-info)",
  pass: "var(--lab-pass)",
}

const CAT_COLOR: Record<string, string> = {
  issue: "var(--lab-fail)",
  question: "var(--lab-info)",
  spec: "var(--lab-spec)",
  idea: "var(--lab-idea)",
  praise: "var(--lab-pass)",
}

export function FrameView(props: FrameViewProps) {
  const {
    frameKey,
    source,
    viewport,
    switches,
    box,
    project,
    annotationsTarget,
    tools,
    analyzeSwitches = true,
    compact,
    reloadKey = 0,
  } = props
  const ui = useLab((s) => s.ui)
  const annotations = useLab((s) => s.project.annotations)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<Document | null>(null)
  const [tick, setTick] = useState(0)
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({})
  const [proxyPath, setProxyPath] = useState(
    source.kind === "proxy" ? source.path : ""
  )
  // Keyed by request so a stale response or failure never applies to a newer path
  const [proxied, setProxied] = useState<{
    key: string
    html: string | null
    failed: boolean
  } | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [hover, setHover] = useState<Element | null>(null)
  const [altKey, setAltKey] = useState(false)
  const [focusEl, setFocusEl] = useState<Element | null>(null)
  const [draft, setDraft] = useState<{
    kind: string
    a: { x: number; y: number }
    b: { x: number; y: number }
  } | null>(null)
  const sel = inspected.use((v) => (v?.frame === frameKey ? v : null))
  const syncing = useRef(false)

  // ── Geometry ───────────────────────────────────────────────────────────
  const isImage = source.kind === "image"
  const cw = isImage
    ? (imgSize?.w ?? 800)
    : Math.round(viewport.w / viewport.zoom)
  const ch = isImage
    ? (imgSize?.h ?? 600)
    : Math.round(viewport.h / viewport.zoom)
  const deviceW = isImage ? cw : viewport.w
  const deviceH = isImage ? ch : viewport.h
  const { w: vpW, h: vpH, zoom: vpZoom } = viewport
  const fit = Math.max(0.05, Math.min(box.w / deviceW, box.h / deviceH, 1))
  const s = (deviceW * fit) / cw

  useEffect(() => () => dropFrame(frameKey), [frameKey])

  // Latest callbacks without re-subscribing listeners when parents re-render
  const onScrollYRef = useRef(props.onScrollY)
  const onAnalysesRef = useRef(props.onAnalyses)
  useEffect(() => {
    onScrollYRef.current = props.onScrollY
    onAnalysesRef.current = props.onAnalyses
  })

  // ── Loading ────────────────────────────────────────────────────────────
  const proxyPrefix = source.kind === "proxy" ? source.prefix : ""
  const proxyKey = `${proxyPrefix}${proxyPath}#${reloadKey}`
  useEffect(() => {
    if (!proxyPrefix) return
    let cancelled = false
    fetch(proxyPrefix + proxyPath, { credentials: "same-origin" })
      .then((r) => {
        const type = r.headers.get("content-type") ?? ""
        if (!r.ok || !type.includes("html")) throw new Error(String(r.status))
        return r.text()
      })
      .then(
        (html) =>
          !cancelled &&
          setProxied({
            key: proxyKey,
            html: rewriteForProxy(html, proxyPrefix, proxyPath),
            failed: false,
          })
      )
      .catch(
        () =>
          !cancelled && setProxied({ key: proxyKey, html: null, failed: true })
      )
    return () => {
      cancelled = true
    }
  }, [proxyPrefix, proxyPath, proxyKey])
  const current = proxied?.key === proxyKey ? proxied : null
  const proxyFailed = !!current?.failed
  const srcdoc = current?.html ?? null

  const frameUrl =
    source.kind === "url"
      ? source.url
      : source.kind === "proxy" && proxyFailed
        ? source.fallback + proxyPath
        : undefined

  const onLoad = useCallback(() => {
    const d = frameDocument(iframeRef.current)
    setDoc(d)
    const crossOrigin = !d
    patchFrame(frameKey, {
      label: props.label,
      doc: d,
      crossOrigin,
      path: d
        ? source.kind === "proxy"
          ? proxyPath
          : d.location.pathname
        : undefined,
      sourcePath:
        source.kind === "url"
          ? new URL(source.url, location.origin).pathname
          : undefined,
      error:
        source.kind === "proxy" && proxyFailed
          ? "Production proxy unavailable — showing production cross-origin"
          : undefined,
    })
  }, [frameKey, props.label, source, proxyPath, proxyFailed])

  // Production via srcdoc: keep in-page navigation inside the proxy
  useEffect(() => {
    if (!doc || source.kind !== "proxy" || proxyFailed) return
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest?.(
        "a[href]"
      ) as HTMLAnchorElement | null
      if (!a || e.defaultPrevented) return
      const href = a.getAttribute("href") ?? ""
      if (href.startsWith(source.prefix + "/") || href === source.prefix) {
        e.preventDefault()
        setProxyPath(
          href.slice(source.prefix.length).replace(/#.*$/, "") || "/"
        )
      }
    }
    doc.addEventListener("click", onClick)
    return () => doc.removeEventListener("click", onClick)
  }, [doc, source, proxyFailed])

  // ── Switches ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (doc) {
      applyToDocument(doc, switches, project)
      patchFrame(frameKey, { unsupported: [] })
    } else if (!isImage) {
      patchFrame(frameKey, {
        unsupported: unsupportedCrossOrigin(switches, project),
      })
    }
    // Redraw overlays after the browser has laid out the injected styles
    const raf = requestAnimationFrame(() => setTick((t) => t + 1))
    return () => cancelAnimationFrame(raf)
  }, [doc, switches, project, frameKey, isImage])

  // ── Analyses ───────────────────────────────────────────────────────────
  const activeAnalyzers = useMemo(
    () => Object.entries(switches).filter(([id]) => ANALYZERS.has(id)),
    [switches]
  )
  const runAnalyses = useCallback(async () => {
    if (!doc || !analyzeSwitches) return
    const out: Record<string, Analysis> = {}
    for (const [id, value] of activeAnalyzers) {
      try {
        const a = await analyze(doc, id, value)
        if (a) out[id] = a
      } catch (err) {
        out[id] = {
          switchId: id,
          summary: `Failed: ${(err as Error).message}`,
          findings: [],
        }
      }
    }
    setAnalyses(out)
    patchFrame(frameKey, { analyses: out })
    onAnalysesRef.current?.(out)
  }, [doc, analyzeSwitches, activeAnalyzers, frameKey])

  useEffect(() => {
    if (!activeAnalyzers.length) {
      patchFrame(frameKey, { analyses: {} })
      onAnalysesRef.current?.({})
      return
    }
    // Re-run after the frame has laid out at a new viewport size
    void [vpW, vpH, vpZoom]
    const t = setTimeout(runAnalyses, 250)
    return () => clearTimeout(t)
  }, [runAnalyses, vpW, vpH, vpZoom, activeAnalyzers.length, frameKey])

  // Re-measure when the page changes itself (carousels, menus, lazy content)
  useEffect(() => {
    if (!doc?.body) return
    let t: ReturnType<typeof setTimeout> | undefined
    const mo = new MutationObserver((records) => {
      if (
        records.every((r) => (r.target as Element).closest?.("[data-lab-ui]"))
      )
        return
      clearTimeout(t)
      t = setTimeout(() => {
        if (activeAnalyzers.length) runAnalyses()
        setTick((x) => x + 1)
      }, 600)
    })
    mo.observe(doc.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "open", "class", "aria-expanded", "style"],
    })
    return () => {
      mo.disconnect()
      clearTimeout(t)
    }
  }, [doc, runAnalyses, activeAnalyzers.length])

  // Scroll / resize → redraw; compare scroll sync
  useEffect(() => {
    const w = doc?.defaultView
    if (!w) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setTick((t) => t + 1))
      if (!syncing.current) onScrollYRef.current?.(w.scrollY)
      syncing.current = false
    }
    w.addEventListener("scroll", onScroll, { passive: true })
    w.addEventListener("resize", onScroll)
    const onFocus = (e: FocusEvent) => setFocusEl(e.target as Element)
    doc!.addEventListener("focusin", onFocus)
    return () => {
      w.removeEventListener("scroll", onScroll)
      w.removeEventListener("resize", onScroll)
      doc!.removeEventListener("focusin", onFocus)
      cancelAnimationFrame(raf)
    }
  }, [doc])

  useEffect(() => {
    const w = doc?.defaultView
    if (!w || props.scrollY === undefined) return
    if (Math.abs(w.scrollY - props.scrollY) > 2) {
      syncing.current = true
      w.scrollTo({ top: props.scrollY, behavior: "instant" as ScrollBehavior })
    }
  }, [doc, props.scrollY])

  // Shortcuts while focus is inside the frame: with a lab tool active, keys
  // belong to the lab; with Interact, they belong to the design under test.
  useEffect(() => {
    if (!doc || !tools) return
    const onKey = (e: KeyboardEvent) => {
      if (
        store.state.ui.tool === "interact" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return
      const t = e.target as Element | null
      if (t?.closest?.("input, textarea, select, [contenteditable=true]"))
        return
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: e.key, bubbles: true })
      )
      e.preventDefault()
    }
    doc.addEventListener("keydown", onKey)
    return () => doc.removeEventListener("keydown", onKey)
  }, [doc, tools])

  // ── Inspect ────────────────────────────────────────────────────────────
  const inspecting = tools && ui.tool === "inspect" && !!doc
  useEffect(() => {
    if (!inspecting || !doc) return
    const d = doc
    inspectingDocs.add(d)
    const move = (e: MouseEvent) => {
      setHover(e.target as Element)
      setAltKey(e.altKey)
    }
    const click = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = e.target as Element
      // Index tokens now, after switches (candidate token values) have applied
      inspected.set({ frame: frameKey, el, spec: inspect(el, tokenIndex(d)) })
    }
    const leave = () => setHover(null)
    d.addEventListener("mousemove", move, true)
    d.addEventListener("click", click, true)
    d.addEventListener("mouseleave", leave)
    return () => {
      inspectingDocs.delete(d)
      d.removeEventListener("mousemove", move, true)
      d.removeEventListener("click", click, true)
      d.removeEventListener("mouseleave", leave)
      setHover(null)
    }
  }, [inspecting, doc, frameKey])

  // Re-measure the selected element after switches or the viewport change its styles
  const selEl = sel?.el
  useEffect(() => {
    if (!selEl?.isConnected || !doc) return
    const raf = requestAnimationFrame(() =>
      inspected.set({
        frame: frameKey,
        el: selEl,
        spec: inspect(selEl, tokenIndex(doc)),
      })
    )
    void [vpW, vpZoom]
    return () => cancelAnimationFrame(raf)
  }, [switches, vpW, vpZoom, doc, frameKey, selEl])

  // ── Annotation drawing ─────────────────────────────────────────────────
  const drawing =
    tools && ["pin", "box", "arrow", "label", "measure"].includes(ui.tool)
  const toFrame = (e: React.PointerEvent) => {
    const r = outerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }
  const scroll = () => ({
    x: doc?.defaultView?.scrollX ?? 0,
    y: doc?.defaultView?.scrollY ?? 0,
  })
  // If someone navigates inside the frame, annotations follow the page actually
  // shown: the route target with that path, or none — never the original's pins.
  // A navigated-away document is detached and its location becomes null
  const shownPath =
    source.kind === "url" && doc?.location
      ? doc.location.pathname.replace(/\/$/, "") || "/"
      : null
  const sourcePath =
    source.kind === "url"
      ? new URL(source.url, location.origin).pathname.replace(/\/$/, "") || "/"
      : null
  const target =
    !annotationsTarget || !shownPath || shownPath === sourcePath
      ? annotationsTarget
      : project.targets.find(
          (t) =>
            t.kind === "route" &&
            (t.path.replace(/\/$/, "") || "/") === shownPath
        )?.id
  const mine = target ? annotations.filter((a) => a.target === target) : []

  const create = (
    kind: Annotation["kind"],
    pts: { x: number; y: number }[]
  ) => {
    const sc = scroll()
    const points: AnchoredPoint[] = pts.map((p) =>
      anchorAt(doc, p.x, p.y, sc.x, sc.y)
    )
    const number = Math.max(0, ...mine.map((a) => a.number)) + 1
    const len =
      pts.length === 2
        ? Math.round(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y))
        : 0
    const a: Annotation = {
      id: uid("A"),
      target: target!,
      kind,
      category: kind === "measure" ? "spec" : ui.category,
      points,
      text: kind === "measure" ? `${len}px` : "",
      number,
      hypothesis: ui.hypothesisId,
      viewportW: cw,
      author: ui.identity,
      at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.upsert("annotations", a)
    store.setUI({ selectedAnnotation: a.id })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!drawing || !target) return
    e.preventDefault()
    const p = toFrame(e)
    if (ui.tool === "pin" || ui.tool === "label") return create(ui.tool, [p])
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDraft({ kind: ui.tool, a: p, b: p })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (draft) setDraft({ ...draft, b: toFrame(e) })
  }
  const onPointerUp = () => {
    if (!draft) return
    const { a, b, kind } = draft
    setDraft(null)
    if (Math.hypot(b.x - a.x, b.y - a.y) < 6) {
      if (kind === "box") create("box", [a, { x: a.x + 160, y: a.y + 96 }])
      return
    }
    create(
      kind as Annotation["kind"],
      kind === "box"
        ? [
            { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
            { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
          ]
        : [a, b]
    )
  }

  // ── Render helpers ─────────────────────────────────────────────────────
  void tick
  const rect = (el: Element) => {
    if (!el.isConnected) return null
    const r = el.getBoundingClientRect()
    if (r.bottom < -50 || r.top > ch + 50 || (r.width === 0 && r.height === 0))
      return null
    return r
  }
  const filter = frameFilter(switches)
  // Passing contrast runs aren't drawn — hundreds of green boxes hide the failures
  const shown = activeAnalyzers.length ? analyses : {}
  const overlayFindings: Finding[] = []
  for (const a of Object.values(shown)) {
    if (a.switchId === "tab-order") continue
    for (const f of a.findings)
      if (f.el && (f.severity !== "pass" || a.switchId !== "contrast"))
        overlayFindings.push(f)
  }
  const tabFindings = shown["tab-order"]?.findings ?? []
  const sc = scroll()

  return (
    <div
      className={`lab-frame ${compact ? "lab-frame-compact" : ""}`}
      ref={outerRef}
      style={{ width: cw * s, height: ch * s }}
      data-frame={frameKey}
    >
      <div
        className="lab-frame-inner"
        style={{ width: cw, height: ch, transform: `scale(${s})` }}
      >
        {isImage ? (
          <img
            src={source.url}
            alt=""
            style={{
              width: cw,
              height: ch,
              filter: filter || undefined,
              ...props.frameStyle,
            }}
            onLoad={(e) =>
              setImgSize({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            draggable={false}
          />
        ) : (
          <iframe
            key={`${reloadKey}-${frameUrl ?? "srcdoc"}`}
            ref={iframeRef}
            title={props.label}
            src={frameUrl}
            srcDoc={
              source.kind === "proxy" && !proxyFailed
                ? (srcdoc ?? "<!doctype html><title>Loading</title>")
                : undefined
            }
            width={cw}
            height={ch}
            onLoad={onLoad}
            style={{ filter: filter || undefined, ...props.frameStyle }}
          />
        )}
      </div>

      {
        <svg
          className="lab-overlay"
          width={cw * s}
          height={ch * s}
          style={{
            pointerEvents: drawing ? "all" : "none",
            cursor: drawing ? "crosshair" : undefined,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-hidden="true"
        >
          <defs>
            <marker
              id={`arrow-${frameKey}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {switches.grid && (
            <GridOverlay mode={switches.grid} w={cw} h={ch} s={s} />
          )}
          {switches.fold &&
            [1, 2, 3].map((k) => {
              const y = (k * ch - sc.y) * s
              return y > 0 && y < ch * s ? (
                <g key={k}>
                  <line x1={0} x2={cw * s} y1={y} y2={y} className="lab-fold" />
                  <text x={6} y={y - 4} className="lab-ov-text">
                    Screen {k} ends
                  </text>
                </g>
              ) : null
            })}

          {ui.showFindings &&
            overlayFindings.slice(0, 400).map((f) => {
              const r = rect(f.el!)
              if (!r) return null
              return (
                <g key={f.id}>
                  <rect
                    x={r.left * s}
                    y={r.top * s}
                    width={Math.max(2, r.width * s)}
                    height={Math.max(2, r.height * s)}
                    className="lab-ov-box"
                    style={{ stroke: SEV_COLOR[f.severity] }}
                  />
                  {f.label && !compact && (
                    <g
                      transform={`translate(${r.left * s}, ${Math.max(0, r.top * s - 15)})`}
                    >
                      <rect
                        width={Math.min(220, f.label.length * 6.4 + 8)}
                        height={14}
                        rx={3}
                        style={{ fill: SEV_COLOR[f.severity] }}
                      />
                      <text x={4} y={10.5} className="lab-ov-label">
                        {f.label}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}

          {ui.showFindings && tabFindings.length > 0 && (
            <g>
              <polyline
                className="lab-tab-line"
                points={tabFindings
                  .map((f) => {
                    const r = f.el && rect(f.el)
                    return r
                      ? `${(r.left + r.width / 2) * s},${(r.top + r.height / 2) * s}`
                      : null
                  })
                  .filter(Boolean)
                  .join(" ")}
              />
              {tabFindings.map((f) => {
                const r = f.el && rect(f.el)
                if (!r) return null
                const x = (r.left + r.width / 2) * s
                const y = (r.top + r.height / 2) * s
                return (
                  <g key={f.id}>
                    <rect
                      x={r.left * s}
                      y={r.top * s}
                      width={r.width * s}
                      height={r.height * s}
                      className="lab-ov-box"
                      style={{
                        stroke:
                          SEV_COLOR[
                            f.severity === "pass" ? "info" : f.severity
                          ],
                      }}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={10}
                      className="lab-tab-dot"
                      style={{
                        fill: SEV_COLOR[
                          f.severity === "pass" ? "info" : f.severity
                        ],
                      }}
                    />
                    <text
                      x={x}
                      y={y + 3.5}
                      textAnchor="middle"
                      className="lab-ov-label"
                    >
                      {f.order}
                    </text>
                  </g>
                )
              })}
            </g>
          )}

          {switches["focus-tracker"] &&
            focusEl &&
            focusEl !== doc?.body &&
            (() => {
              const r = rect(focusEl)
              return r ? (
                <rect
                  x={r.left * s - 4}
                  y={r.top * s - 4}
                  width={r.width * s + 8}
                  height={r.height * s + 8}
                  rx={4}
                  className="lab-focus-ring"
                />
              ) : null
            })()}

          {inspecting && hover && <BoxModel el={hover} s={s} />}
          {sel?.el &&
            rect(sel.el) &&
            (() => {
              const r = rect(sel.el)!
              return (
                <rect
                  x={r.left * s}
                  y={r.top * s}
                  width={r.width * s}
                  height={r.height * s}
                  className="lab-sel-box"
                />
              )
            })()}
          {inspecting && altKey && sel?.el && hover && hover !== sel.el && (
            <Redlines
              a={sel.el.getBoundingClientRect()}
              b={hover.getBoundingClientRect()}
              s={s}
            />
          )}

          {ui.showAnnotations &&
            mine.map((a) => {
              const pts = a.points.map((p) => resolvePoint(doc, p, sc.x, sc.y))
              const color = CAT_COLOR[a.category]
              const selected = ui.selectedAnnotation === a.id
              const detached = pts.some((p) => p.detached)
              const cls = `lab-ann ${selected ? "is-selected" : ""} ${a.resolved ? "is-resolved" : ""} ${detached ? "is-detached" : ""}`
              const P = (i: number) => ({ x: pts[i].x * s, y: pts[i].y * s })
              const pick = (e: React.PointerEvent) => {
                e.stopPropagation()
                store.setUI({ selectedAnnotation: a.id })
              }
              return (
                <g
                  key={a.id}
                  className={cls}
                  style={{ color, pointerEvents: "all", cursor: "pointer" }}
                  onPointerDown={pick}
                >
                  {a.kind === "box" && pts[1] && (
                    <rect
                      x={P(0).x}
                      y={P(0).y}
                      width={Math.abs(P(1).x - P(0).x)}
                      height={Math.abs(P(1).y - P(0).y)}
                      className="lab-ann-box"
                    />
                  )}
                  {(a.kind === "arrow" || a.kind === "measure") && pts[1] && (
                    <line
                      x1={P(0).x}
                      y1={P(0).y}
                      x2={P(1).x}
                      y2={P(1).y}
                      className={
                        a.kind === "measure"
                          ? "lab-ann-measure"
                          : "lab-ann-line"
                      }
                      markerEnd={`url(#arrow-${frameKey})`}
                      markerStart={
                        a.kind === "measure"
                          ? `url(#arrow-${frameKey})`
                          : undefined
                      }
                    />
                  )}
                  {a.kind === "measure" && pts[1] && (
                    <text
                      x={(P(0).x + P(1).x) / 2 + 6}
                      y={(P(0).y + P(1).y) / 2 - 6}
                      className="lab-ov-text lab-ann-measure-text"
                    >
                      {a.text}
                    </text>
                  )}
                  {a.kind === "label" ? (
                    <g transform={`translate(${P(0).x}, ${P(0).y})`}>
                      <rect
                        x={0}
                        y={-11}
                        width={Math.max(
                          28,
                          (a.text || "Label").length * 6.6 + 26
                        )}
                        height={22}
                        rx={11}
                        className="lab-ann-label"
                      />
                      <text x={20} y={4} className="lab-ann-label-text">
                        {a.text || "Label"}
                      </text>
                      <text
                        x={9}
                        y={4}
                        textAnchor="middle"
                        className="lab-ann-num-small"
                      >
                        {a.number}
                      </text>
                    </g>
                  ) : (
                    <g transform={`translate(${P(0).x}, ${P(0).y})`}>
                      <circle r={11} className="lab-ann-pin" />
                      <text y={4} textAnchor="middle" className="lab-ann-num">
                        {a.number}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}

          {draft && (
            <g
              className="lab-ann is-selected"
              style={{ color: CAT_COLOR[ui.category] }}
            >
              {draft.kind === "box" ? (
                <rect
                  x={Math.min(draft.a.x, draft.b.x) * s}
                  y={Math.min(draft.a.y, draft.b.y) * s}
                  width={Math.abs(draft.b.x - draft.a.x) * s}
                  height={Math.abs(draft.b.y - draft.a.y) * s}
                  className="lab-ann-box"
                />
              ) : (
                <line
                  x1={draft.a.x * s}
                  y1={draft.a.y * s}
                  x2={draft.b.x * s}
                  y2={draft.b.y * s}
                  className="lab-ann-line"
                  markerEnd={`url(#arrow-${frameKey})`}
                />
              )}
              {draft.kind === "measure" && (
                <text
                  x={draft.b.x * s + 8}
                  y={draft.b.y * s}
                  className="lab-ov-text"
                >
                  {Math.round(
                    Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y)
                  )}
                  px
                </text>
              )}
            </g>
          )}
        </svg>
      }

      {!compact &&
        ui.showAnnotations &&
        ui.selectedAnnotation &&
        (() => {
          const a = mine.find((x) => x.id === ui.selectedAnnotation)
          if (!a) return null
          const p = resolvePoint(doc, a.points[a.points.length - 1], sc.x, sc.y)
          return (
            <AnnotationCard
              key={a.id}
              annotation={a}
              x={Math.min(p.x * s + 16, cw * s - 300)}
              y={Math.max(8, Math.min(p.y * s, ch * s - 220))}
              project={project}
            />
          )
        })()}
    </div>
  )
}

function GridOverlay({
  mode,
  w,
  h,
  s,
}: {
  mode: string
  w: number
  h: number
  s: number
}) {
  if (mode === "cols-12") {
    const margin = 16
    const gutter = 16
    const col = (w - margin * 2 - gutter * 11) / 12
    return (
      <g className="lab-grid-cols">
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x={(margin + i * (col + gutter)) * s}
            y={0}
            width={col * s}
            height={h * s}
          />
        ))}
      </g>
    )
  }
  const step = Number(mode) || 8
  const lines = []
  for (let y = step; y < h; y += step)
    lines.push(
      <line
        key={`y${y}`}
        x1={0}
        x2={w * s}
        y1={y * s}
        y2={y * s}
        className={y % (step * 4) === 0 ? "lab-grid-major" : "lab-grid-minor"}
      />
    )
  for (let x = step; x < w; x += step)
    lines.push(
      <line
        key={`x${x}`}
        y1={0}
        y2={h * s}
        x1={x * s}
        x2={x * s}
        className={x % (step * 4) === 0 ? "lab-grid-major" : "lab-grid-minor"}
      />
    )
  return <g>{lines}</g>
}

/** DevTools-style margin / padding / content box for the hovered element. */
function BoxModel({ el, s }: { el: Element; s: number }) {
  if (!el.isConnected) return null
  const r = el.getBoundingClientRect()
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el)
  const n = (v: string) => parseFloat(v) || 0
  const m = [
    n(cs.marginTop),
    n(cs.marginRight),
    n(cs.marginBottom),
    n(cs.marginLeft),
  ]
  const b = [
    n(cs.borderTopWidth),
    n(cs.borderRightWidth),
    n(cs.borderBottomWidth),
    n(cs.borderLeftWidth),
  ]
  const p = [
    n(cs.paddingTop),
    n(cs.paddingRight),
    n(cs.paddingBottom),
    n(cs.paddingLeft),
  ]
  const box = (x: number, y: number, w: number, h: number, cls: string) => (
    <rect
      x={x * s}
      y={y * s}
      width={Math.max(0, w * s)}
      height={Math.max(0, h * s)}
      className={cls}
    />
  )
  return (
    <g>
      {box(
        r.left - m[3],
        r.top - m[0],
        r.width + m[1] + m[3],
        r.height + m[0] + m[2],
        "lab-bm-margin"
      )}
      {box(
        r.left + b[3],
        r.top + b[0],
        r.width - b[1] - b[3],
        r.height - b[0] - b[2],
        "lab-bm-padding"
      )}
      {box(
        r.left + b[3] + p[3],
        r.top + b[0] + p[0],
        r.width - b[1] - b[3] - p[1] - p[3],
        r.height - b[0] - b[2] - p[0] - p[2],
        "lab-bm-content"
      )}
      <g transform={`translate(${r.left * s}, ${Math.max(0, r.top * s - 17)})`}>
        <rect width={150} height={15} rx={3} className="lab-bm-tag" />
        <text x={4} y={11} className="lab-ov-label">
          {el.tagName.toLowerCase()} {Math.round(r.width)}×
          {Math.round(r.height)}
        </text>
      </g>
    </g>
  )
}

function Redlines({ a, b, s }: { a: DOMRect; b: DOMRect; s: number }) {
  const g = gaps(a, b)
  const out = []
  if (g.vertical) {
    const x =
      (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2 ||
      a.left + a.width / 2
    const y1 = b.top >= a.bottom ? a.bottom : b.bottom
    const y2 = y1 + g.vertical
    out.push(
      <g key="v">
        <line
          x1={x * s}
          x2={x * s}
          y1={y1 * s}
          y2={y2 * s}
          className="lab-redline"
        />
        <text
          x={x * s + 5}
          y={((y1 + y2) / 2) * s + 4}
          className="lab-redline-text"
        >
          {g.vertical}
        </text>
      </g>
    )
  }
  if (g.horizontal) {
    const y =
      (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2 ||
      a.top + a.height / 2
    const x1 = b.left >= a.right ? a.right : b.right
    const x2 = x1 + g.horizontal
    out.push(
      <g key="h">
        <line
          y1={y * s}
          y2={y * s}
          x1={x1 * s}
          x2={x2 * s}
          className="lab-redline"
        />
        <text
          x={((x1 + x2) / 2) * s - 6}
          y={y * s - 5}
          className="lab-redline-text"
        >
          {g.horizontal}
        </text>
      </g>
    )
  }
  return <g>{out}</g>
}
