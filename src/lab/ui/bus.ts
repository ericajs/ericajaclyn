// Small shared state for live frame data that must not be persisted:
// analysis results, the inspected element, toasts.

import { useSyncExternalStore } from "react"
import type { Analysis } from "../engine/analyze"
import type { Spec } from "../engine/inspect"

export function createBus<T>(initial: T) {
  let value = initial
  const ls = new Set<() => void>()
  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next
      ls.forEach((l) => l())
    },
    subscribe(l: () => void) {
      ls.add(l)
      return () => ls.delete(l)
    },
    use<S>(sel: (v: T) => S): S {
      return useSyncExternalStore(
        this.subscribe,
        () => sel(value),
        () => sel(value)
      )
    },
  }
}

export interface FrameInfo {
  key: string
  label: string
  doc: Document | null
  crossOrigin: boolean
  /** Switches that couldn't reach a cross-origin frame */
  unsupported: string[]
  analyses: Record<string, Analysis>
  /** Path currently shown, and the path the frame was opened at */
  path?: string
  sourcePath?: string
  error?: string
}

export const frames = createBus<Record<string, FrameInfo>>({})

export function patchFrame(key: string, patch: Partial<FrameInfo>) {
  frames.set((all) => ({
    ...all,
    [key]: {
      ...(all[key] ?? {
        key,
        label: key,
        doc: null,
        crossOrigin: false,
        unsupported: [],
        analyses: {},
      }),
      ...patch,
    },
  }))
}

export function dropFrame(key: string) {
  frames.set((all) => {
    if (!(key in all)) return all
    const next = { ...all }
    delete next[key]
    return next
  })
}

export const inspected = createBus<{
  frame: string
  spec: Spec
  el: Element
} | null>(null)

export interface Toast {
  id: number
  text: string
}
export const toasts = createBus<Toast[]>([])
let toastId = 0
export function toast(text: string) {
  const id = ++toastId
  toasts.set((t) => [...t, { id, text }])
  setTimeout(() => toasts.set((t) => t.filter((x) => x.id !== id)), 4000)
}
