// Non-component helpers shared by the lab UI (kept out of .tsx files so
// React Fast Refresh boundaries stay clean).

import { useEffect, useState } from "react"
import type { Analysis } from "../engine/analyze"
import { imageUrl } from "../store/images"
import { useLab } from "../store/store"
import type { AnnotationCategory, Comment } from "../types"

export const CATEGORIES: { value: AnnotationCategory; label: string }[] = [
  { value: "issue", label: "Issue" },
  { value: "question", label: "Question" },
  { value: "spec", label: "Spec" },
  { value: "idea", label: "Idea" },
  { value: "praise", label: "Works well" },
]

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Failure counts per check, for storyboard and matrix cell footers. */
export function failCounts(
  analyses: Record<string, Analysis> | undefined
): { id: string; n: number }[] {
  return Object.values(analyses ?? {})
    .map((a) => ({
      id: a.switchId,
      n: a.findings.filter((f) => f.severity === "fail").length,
    }))
    .filter((x) => x.n > 0)
}

/** Threads where someone asked Claude and Claude hasn't replied since. */
export function awaitingClaude(comments: Comment[], thread: string): boolean {
  const list = comments
    .filter((c) => c.thread === thread)
    .sort((a, b) => a.at.localeCompare(b.at))
  const lastAsk = list
    .filter((c) => c.needsClaude && c.author !== "claude")
    .pop()
  if (!lastAsk) return false
  return !list.some((c) => c.author === "claude" && c.at > lastAsk.at)
}

export function useImageUrl(ref: string | undefined): string | null {
  const projectId = useLab((s) => s.ui.projectId)
  const [resolved, setResolved] = useState<{
    ref: string
    url: string | null
  } | null>(null)
  useEffect(() => {
    let live = true
    if (ref)
      imageUrl(ref, projectId).then((url) => live && setResolved({ ref, url }))
    return () => {
      live = false
    }
  }, [ref, projectId])
  return resolved && resolved.ref === ref ? resolved.url : null
}
