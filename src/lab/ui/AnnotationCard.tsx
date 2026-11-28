import { useEffect, useRef, useState } from "react"
import { store, personName } from "../store/store"
import type { Annotation, AnnotationCategory, Project } from "../types"
import { TextField } from "./primitives"
import { Thread } from "./Thread"
import { CATEGORIES } from "./util"

export function AnnotationCard({
  annotation: a,
  x,
  y,
  project,
}: {
  annotation: Annotation
  x: number
  y: number
  project: Project
}) {
  const [text, setText] = useState(a.text ?? "")
  const ref = useRef<HTMLTextAreaElement>(null)
  // Rendered with key={annotation.id}, so state starts fresh per annotation
  useEffect(() => {
    if (!a.text) ref.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const save = (patch: Partial<Annotation>) =>
    store.upsert("annotations", { ...a, ...patch })
  return (
    <div
      className="lab-ann-card"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={`Annotation ${a.number}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") store.setUI({ selectedAnnotation: undefined })
      }}
    >
      <div className="lab-ann-card-head">
        <strong>#{a.number}</strong>
        <select
          aria-label="Category"
          data-tip="Category of this annotation"
          value={a.category}
          onChange={(e) =>
            save({ category: e.target.value as AnnotationCategory })
          }
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="lab-muted">
          {a.kind} · {personName(project, a.author)}
        </span>
        <button
          type="button"
          className="lab-icon-btn"
          aria-label="Close annotation"
          onClick={() => store.setUI({ selectedAnnotation: undefined })}
        >
          ✕
        </button>
      </div>
      <TextField
        multiline
        inputRef={ref}
        label={a.kind === "label" ? "Label" : "Annotation"}
        placeholder={a.kind === "label" ? "Label text" : "What do you see?"}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (a.text ?? "") && save({ text })}
      />
      <div className="lab-row lab-gap-2 lab-wrap">
        <select
          aria-label="Hypothesis"
          data-tip="Question this annotation belongs to"
          value={a.hypothesis ?? ""}
          onChange={(e) => save({ hypothesis: e.target.value || undefined })}
        >
          <option value="">No hypothesis</option>
          {project.hypotheses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.id} {h.title.slice(0, 40)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="lab-link-btn"
          onClick={() => save({ resolved: !a.resolved })}
        >
          {a.resolved ? "Reopen" : "Resolve"}
        </button>
        <button
          type="button"
          className="lab-link-btn lab-danger"
          onClick={() => {
            store.remove("annotations", a.id)
            store.setUI({ selectedAnnotation: undefined })
          }}
        >
          Delete
        </button>
      </div>
      {a.points.some((p) => p.anchor) ? (
        <p className="lab-muted lab-xs">
          Anchored to {a.points[0].anchor?.selector.slice(0, 60)}
        </p>
      ) : (
        <p className="lab-muted lab-xs">
          Not anchored (cross-origin or image) — position is fixed to the
          viewport.
        </p>
      )}
      <Thread thread={a.id} compact />
    </div>
  )
}
