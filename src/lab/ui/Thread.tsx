import { useState } from "react"
import { personName, store, useLab } from "../store/store"
import { TextField } from "./primitives"
import { timeAgo } from "./util"

/**
 * Comment thread on any entity. Claude is a participant by default: "Ask
 * Claude" is on, and flagged comments lead the next handoff digest.
 */
export function Thread({
  thread,
  compact,
}: {
  thread: string
  compact?: boolean
}) {
  const project = useLab((s) => s.project)
  const me = useLab((s) => s.ui.identity)
  const comments = project.comments
    .filter((c) => c.thread === thread)
    .sort((a, b) => a.at.localeCompare(b.at))
  const [body, setBody] = useState("")
  const [ask, setAsk] = useState(true)
  const role = (id: string) =>
    project.people.find((p) => p.id === id)?.role ?? "contributor"

  const send = () => {
    if (!body.trim()) return
    store.comment(thread, body.trim(), ask)
    setBody("")
  }

  return (
    <div className={`lab-thread ${compact ? "lab-thread-compact" : ""}`}>
      {comments.length > 0 && (
        <ol className="lab-comments" aria-label="Comments">
          {comments.map((c) => (
            <li key={c.id} className={`lab-comment role-${role(c.author)}`}>
              <div className="lab-comment-head">
                <span className="lab-avatar" aria-hidden="true">
                  {role(c.author) === "claude"
                    ? "✳"
                    : personName(project, c.author).slice(0, 1)}
                </span>
                <strong>{personName(project, c.author)}</strong>
                <span className="lab-muted">{timeAgo(c.at)}</span>
                {c.needsClaude && role(c.author) !== "claude" && (
                  <span className="lab-chip lab-chip-claude">Asked Claude</span>
                )}
                {c.author === me && (
                  <button
                    type="button"
                    className="lab-link-btn lab-push"
                    onClick={() => store.remove("comments", c.id)}
                    aria-label="Delete comment"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="lab-comment-body">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form
        className="lab-composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <TextField
          multiline
          label="Comment"
          rows={compact ? 1 : 2}
          placeholder={
            compact
              ? "Add a comment"
              : "Comment, question or decision rationale"
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="lab-row lab-gap-2">
          <label className="lab-check">
            <input
              type="checkbox"
              checked={ask}
              onChange={(e) => setAsk(e.target.checked)}
            />{" "}
            Ask Claude
          </label>
          <button
            type="submit"
            className="lab-btn lab-btn-primary lab-push"
            disabled={!body.trim()}
          >
            Comment
          </button>
        </div>
      </form>
    </div>
  )
}
