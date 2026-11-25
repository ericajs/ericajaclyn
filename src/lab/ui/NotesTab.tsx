// Project notes: free-form design notes with pasted screenshots, area
// marking on those screenshots, and links to hypotheses and targets.

import { useEffect, useState } from "react"
import { captureRegion, clipboardImage, putImage } from "../store/images"
import { personName, store, uid, useLab, type Tool } from "../store/store"
import type { Note } from "../types"
import { toast } from "./bus"
import { FrameView } from "./FrameView"
import { Btn, Dialog, TextField } from "./primitives"
import { Thread } from "./Thread"
import { CATEGORIES, timeAgo, useImageUrl } from "./util"

export function Thumb({
  ref_,
  onOpen,
  onRemove,
  marks,
}: {
  ref_: string
  onOpen?: () => void
  onRemove?: () => void
  marks?: number
}) {
  const url = useImageUrl(ref_)
  return (
    <div className="lab-thumb">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open screenshot to mark it up"
        disabled={!url}
      >
        {url ? (
          <img src={url} alt="" />
        ) : (
          <span className="lab-muted lab-xs">Image not in this browser</span>
        )}
      </button>
      {marks ? <span className="lab-badge">{marks}</span> : null}
      {onRemove && (
        <button
          type="button"
          className="lab-thumb-x"
          aria-label="Remove image"
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  )
}

/** Screenshot markup: the same annotation engine, on an image. */
export function ImageMarkup({
  open,
  onClose,
  imageRef,
  target,
}: {
  open: boolean
  onClose: () => void
  imageRef: string
  target: string
}) {
  const url = useImageUrl(imageRef)
  const project = useLab((s) => s.project)
  const ui = useLab((s) => s.ui)
  const tools: { id: Tool; label: string }[] = [
    { id: "box", label: "Mark area" },
    { id: "pin", label: "Pin" },
    { id: "arrow", label: "Arrow" },
    { id: "label", label: "Label" },
    { id: "measure", label: "Measure" },
  ]
  useEffect(() => {
    if (open && !tools.some((t) => t.id === ui.tool))
      store.setUI({ tool: "box" })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog
      open={open}
      onClose={() => {
        store.setUI({ tool: "interact", selectedAnnotation: undefined })
        onClose()
      }}
      title="Mark up screenshot"
      wide
    >
      <div className="lab-row lab-gap-2 lab-wrap">
        <div
          role="group"
          aria-label="Markup tools"
          className="lab-seg lab-seg-sm"
        >
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={ui.tool === t.id}
              onClick={() => store.setUI({ tool: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Annotation type"
          data-tip="Category given to new annotations"
          value={ui.category}
          onChange={(e) =>
            store.setUI({ category: e.target.value as typeof ui.category })
          }
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="lab-markup-stage">
        {url && (
          <FrameView
            frameKey={`img-${imageRef}`}
            label="Screenshot"
            source={{ kind: "image", url }}
            viewport={{ w: 1, h: 1, zoom: 1 }}
            switches={{}}
            box={{
              w: Math.min(1100, window.innerWidth - 120),
              h: window.innerHeight - 260,
            }}
            project={project}
            annotationsTarget={target}
            tools
          />
        )}
      </div>
    </Dialog>
  )
}

function NoteEditor({ note }: { note: Note }) {
  const project = useLab((s) => s.project)
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [markup, setMarkup] = useState<string | null>(null)
  const save = (patch: Partial<Note>) =>
    store.upsert("notes", { ...note, ...patch })
  const attach = async (blob: Blob) => {
    const ref = await putImage(blob)
    const latest =
      store.state.project.notes.find((n) => n.id === note.id) ?? note
    store.upsert("notes", { ...latest, images: [...latest.images, ref] })
  }
  const snap = async () => {
    const stage = document.querySelector(".lab-stage")
    if (!stage) return toast("Nothing on the canvas to capture")
    try {
      await attach(await captureRegion(stage))
      toast("Canvas captured")
    } catch {
      toast("Capture cancelled or not supported — paste a screenshot instead")
    }
  }
  return (
    <div
      className="lab-note-editor"
      onPaste={async (e) => {
        const img = clipboardImage(e.nativeEvent)
        if (img) {
          e.preventDefault()
          await attach(img)
          toast("Screenshot attached")
        }
      }}
    >
      <TextField
        className="lab-tf-title"
        inputClassName="lab-title-input"
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== note.title && save({ title })}
      />
      <TextField
        multiline
        label="Note"
        placeholder="Write, or paste a screenshot (⌘V / Ctrl+V)"
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => body !== note.body && save({ body })}
      />
      <div className="lab-thumbs">
        {note.images.map((ref) => (
          <Thumb
            key={ref}
            ref_={ref}
            marks={
              project.annotations.filter(
                (a) => a.target === `note:${note.id}:${ref}`
              ).length
            }
            onOpen={() => setMarkup(ref)}
            onRemove={() =>
              save({ images: note.images.filter((x) => x !== ref) })
            }
          />
        ))}
      </div>
      <div className="lab-row lab-gap-2 lab-wrap">
        <Btn
          onClick={snap}
          title="Capture the canvas exactly as shown, filters and overlays included (asks for screen-capture permission)"
        >
          Snap canvas
        </Btn>
        <label className="lab-btn lab-btn-outline">
          Attach image
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])}
          />
        </label>
        <select
          aria-label="Linked hypothesis"
          data-tip="Question this note is linked to"
          value={note.hypothesis ?? ""}
          onChange={(e) => save({ hypothesis: e.target.value || undefined })}
        >
          <option value="">No hypothesis</option>
          {project.hypotheses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.id} {h.title.slice(0, 36)}
            </option>
          ))}
        </select>
        <select
          aria-label="Linked target"
          data-tip="Page, component or image this note is about"
          value={note.target ?? ""}
          onChange={(e) => save({ target: e.target.value || undefined })}
        >
          <option value="">No target</option>
          {project.targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="lab-link-btn lab-danger lab-push"
          onClick={() => store.remove("notes", note.id)}
        >
          Delete note
        </button>
      </div>
      <Thread thread={note.id} compact />
      {markup && (
        <ImageMarkup
          open
          onClose={() => setMarkup(null)}
          imageRef={markup}
          target={`note:${note.id}:${markup}`}
        />
      )}
    </div>
  )
}

export function NotesTab() {
  const project = useLab((s) => s.project)
  const me = useLab((s) => s.ui.identity)
  const hypothesisId = useLab((s) => s.ui.hypothesisId)
  const [open, setOpen] = useState<string | null>(null)
  const notes = [...project.notes].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
  const create = () => {
    const n: Note = {
      id: uid("N"),
      title: "Untitled note",
      body: "",
      images: [],
      hypothesis: hypothesisId,
      target: store.state.ui.rig.target,
      author: me,
      at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.upsert("notes", n)
    setOpen(n.id)
  }
  return (
    <div className="lab-notes">
      <div className="lab-row lab-gap-2">
        <p className="lab-xs lab-muted">
          General design notes for this project. Paste screenshots straight in,
          then mark areas on them.
        </p>
        <Btn variant="primary" className="lab-push" onClick={create}>
          New note
        </Btn>
      </div>
      <ul className="lab-note-list">
        {notes.map((n) => (
          <li key={n.id} className={open === n.id ? "is-open" : ""}>
            <button
              type="button"
              className="lab-note-head"
              aria-expanded={open === n.id}
              onClick={() => setOpen(open === n.id ? null : n.id)}
            >
              <strong>{n.title}</strong>
              <span className="lab-xs lab-muted">
                {personName(project, n.author)} · {timeAgo(n.updatedAt)}
                {n.hypothesis ? ` · ${n.hypothesis}` : ""}
                {n.images.length
                  ? ` · ${n.images.length} image${n.images.length > 1 ? "s" : ""}`
                  : ""}
              </span>
              {open !== n.id && n.body && (
                <span className="lab-xs lab-note-excerpt">
                  {n.body.slice(0, 140)}
                </span>
              )}
            </button>
            {open === n.id && <NoteEditor note={n} />}
          </li>
        ))}
        {!notes.length && <li className="lab-muted lab-xs">No notes yet.</li>}
      </ul>
    </div>
  )
}
