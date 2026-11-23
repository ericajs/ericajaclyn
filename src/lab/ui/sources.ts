import { useEffect, useRef, useState } from "react"
import { componentMeta, framePath } from "../registry/components.meta"
import type { Project, Target } from "../types"
import type { FrameSource } from "./FrameView"

export function targetById(project: Project, id?: string): Target | undefined {
  return project.targets.find((t) => t.id === id)
}

export function designSource(
  t: Target | undefined,
  props?: Record<string, string>
): FrameSource | null {
  if (!t) return null
  if (t.kind === "route") return { kind: "url", url: t.path }
  if (t.kind === "image") return { kind: "image", url: t.src }
  const p = framePath(t.component, props)
  return p ? { kind: "url", url: p } : null
}

export function prodSource(
  t: Target | undefined,
  project: Project
): FrameSource | null {
  if (!t || t.kind !== "route") return null
  const path = t.prodPath ?? t.path
  // Served from production itself: same origin already, no proxy needed
  // (vercel.json only rewrites /_prod on preview hosts)
  if (window.location.origin === project.prodOrigin)
    return { kind: "url", url: path }
  if (project.prodProxy)
    return {
      kind: "proxy",
      path,
      prefix: project.prodProxy,
      fallback: project.prodOrigin,
    }
  return { kind: "url", url: project.prodOrigin + path }
}

export function targetLabel(
  t: Target | undefined,
  props?: Record<string, string>
): string {
  if (!t) return "No target"
  if (t.kind !== "component") return t.name
  const meta = componentMeta(t.component)
  const keys = Object.keys(meta?.axes ?? {})
  const perm = keys
    .map((k) => `${k}=${props?.[k] ?? meta?.defaults[k]}`)
    .join(", ")
  return perm ? `${t.name} (${perm})` : t.name
}

export function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [box, setBox] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect
      setBox({
        w: Math.max(100, Math.floor(r.width)),
        h: Math.max(100, Math.floor(r.height)),
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, box] as const
}
