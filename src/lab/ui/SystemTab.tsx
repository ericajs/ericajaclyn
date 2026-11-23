// Improvements: changes to the project's design system surfaced during review,
// and notes on making this lab itself better. Both reach Claude in handoffs.

import { useState } from "react"
import { clipboardImage, putImage } from "../store/images"
import { personName, store, uid, useLab } from "../store/store"
import type { Improvement, ImprovementScope } from "../types"
import { toast } from "./bus"
import { Thumb } from "./NotesTab"
import { Btn, Segmented } from "./primitives"
import { timeAgo } from "./util"
import { Thread } from "./Thread"

const STATUS: Improvement["status"][] = ["open", "planned", "done", "wontfix"]

export function SystemTab() {
  const project = useLab((s) => s.project)
  const me = useLab((s) => s.ui.identity)
  const hypothesisId = useLab((s) => s.ui.hypothesisId)
  const [scope, setScope] = useState<"all" | ImprovementScope>("all")
  const [draft, setDraft] = useState({
    scope: "design-system" as ImprovementScope,
    title: "",
    body: "",
    images: [] as string[],
  })
  const [open, setOpen] = useState<string | null>(null)
  const items = project.improvements
    .filter((i) => scope === "all" || i.scope === scope)
    .sort(
      (a, b) =>
        STATUS.indexOf(a.status) - STATUS.indexOf(b.status) ||
        b.updatedAt.localeCompare(a.updatedAt)
    )

  const add = () => {
    if (!draft.title.trim()) return
    const i: Improvement = {
      id: uid("I"),
      scope: draft.scope,
      title: draft.title.trim(),
      body: draft.body.trim(),
      status: "open",
      images: draft.images,
      hypothesis: hypothesisId,
      author: me,
      at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.upsert("improvements", i)
    setDraft({ ...draft, title: "", body: "", images: [] })
    toast("Added — it goes to Claude with your next handoff")
  }

  return (
    <div className="lab-system">
      <Segmented
        label="Scope"
        size="sm"
        value={scope}
        onChange={setScope}
        options={[
          { value: "all", label: "All" },
          { value: "design-system", label: "Design system" },
          { value: "lab", label: "This lab app" },
        ]}
      />
      <form
        className="lab-card"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        onPaste={async (e) => {
          const img = clipboardImage(e.nativeEvent)
          if (!img) return
          e.preventDefault()
          const ref = await putImage(img)
          setDraft((d) => ({ ...d, images: [...d.images, ref] }))
        }}
      >
        <div className="lab-row lab-gap-2">
          <select
            aria-label="Improvement scope"
            value={draft.scope}
            onChange={(e) =>
              setDraft({ ...draft, scope: e.target.value as ImprovementScope })
            }
          >
            <option value="design-system">Design system</option>
            <option value="lab">This lab app</option>
          </select>
          <input
            aria-label="Improvement title"
            placeholder={
              draft.scope === "lab"
                ? "What would make the lab better?"
                : "Token, component or pattern to change"
            }
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <textarea
          aria-label="Details"
          rows={2}
          placeholder="Why, and what good looks like. Paste a screenshot if it helps."
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        {draft.images.length > 0 && (
          <div className="lab-thumbs">
            {draft.images.map((r) => (
              <Thumb
                key={r}
                ref_={r}
                onRemove={() =>
                  setDraft({
                    ...draft,
                    images: draft.images.filter((x) => x !== r),
                  })
                }
              />
            ))}
          </div>
        )}
        <Btn type="submit" variant="primary" disabled={!draft.title.trim()}>
          Add improvement
        </Btn>
      </form>
      <ul className="lab-improvements">
        {items.map((i) => (
          <li key={i.id} className={`status-${i.status}`}>
            <div className="lab-row lab-gap-2">
              <span
                className={`lab-chip ${i.scope === "lab" ? "lab-chip-claude" : ""}`}
              >
                {i.scope === "lab" ? "Lab app" : "Design system"}
              </span>
              <button
                type="button"
                className="lab-imp-title"
                aria-expanded={open === i.id}
                onClick={() => setOpen(open === i.id ? null : i.id)}
              >
                {i.title}
              </button>
              <select
                aria-label={`Status of ${i.title}`}
                className="lab-push"
                value={i.status}
                onChange={(e) =>
                  store.upsert("improvements", {
                    ...i,
                    status: e.target.value as Improvement["status"],
                  })
                }
              >
                {STATUS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <p className="lab-xs lab-muted">
              {personName(project, i.author)} · {timeAgo(i.updatedAt)}
              {i.hypothesis ? ` · from ${i.hypothesis}` : ""}
            </p>
            {open === i.id && (
              <>
                {i.body && <p className="lab-pre lab-xs">{i.body}</p>}
                {!!i.images?.length && (
                  <div className="lab-thumbs">
                    {i.images.map((r) => (
                      <Thumb key={r} ref_={r} />
                    ))}
                  </div>
                )}
                <Thread thread={i.id} compact />
              </>
            )}
          </li>
        ))}
        {!items.length && (
          <li className="lab-muted lab-xs">Nothing here yet.</li>
        )}
      </ul>
    </div>
  )
}
