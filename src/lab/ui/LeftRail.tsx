// Left rail: every question's status at a glance, grouped by lifecycle stage.

import { useMemo, useState } from "react"
import { store, useLab } from "../store/store"
import { STAGES, STAGE_META, type Hypothesis, type Stage } from "../types"
import { Btn } from "./primitives"
import { awaitingClaude } from "./util"

const ORDER: Stage[] = [
  "testing",
  "tentative",
  "idea",
  "validated",
  "verified",
  "confirmed",
  "parked",
  "rejected",
]

export function LeftRail() {
  const project = useLab((s) => s.project)
  const selected = useLab((s) => s.ui.hypothesisId)
  const [q, setQ] = useState("")
  const [iteration, setIteration] = useState<string>("all")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    rejected: true,
    parked: true,
  })

  const filtered = useMemo(
    () =>
      project.hypotheses.filter(
        (h) =>
          (iteration === "all" || h.iteration === iteration) &&
          (!q ||
            `${h.id} ${h.title} ${h.statement} ${(h.tags ?? []).join(" ")} ${(h.wcag ?? []).join(" ")}`
              .toLowerCase()
              .includes(q.toLowerCase()))
      ),
    [project.hypotheses, q, iteration]
  )
  const done = project.hypotheses.filter((h) => h.stage === "confirmed").length
  const decided = project.hypotheses.filter((h) => h.decision).length

  const row = (h: Hypothesis) => {
    const unresolved = project.annotations.filter(
      (a) => a.hypothesis === h.id && !a.resolved
    ).length
    const waiting = awaitingClaude(project.comments, h.id)
    return (
      <li key={h.id}>
        <button
          type="button"
          className="lab-rail-item"
          aria-current={h.id === selected ? "true" : undefined}
          onClick={() => store.selectHypothesis(h.id)}
        >
          <span className={`lab-dot stage-${h.stage}`} aria-hidden="true" />
          <span className="lab-rail-text">
            <span className="lab-rail-title">{h.title}</span>
            <span className="lab-rail-meta">
              {h.id}
              {h.priority ? ` · ${h.priority.toUpperCase()}` : ""} ·{" "}
              {h.test.mode}
              {h.decision ? ` · decided: ${h.decision.verdict}` : ""}
            </span>
          </span>
          <span className="lab-rail-flags">
            {waiting && (
              <span
                className="lab-flag lab-flag-claude"
                title="Waiting on Claude"
              >
                ✳<span className="sr-only">Waiting on Claude</span>
              </span>
            )}
            {unresolved > 0 && (
              <span
                className="lab-flag"
                title={`${unresolved} open annotations`}
              >
                {unresolved}
                <span className="sr-only"> open annotations</span>
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <nav className="lab-rail" aria-label="Hypotheses">
      <div className="lab-rail-head">
        <div className="lab-row lab-gap-2">
          <h2 className="brow">Questions</h2>
          <span className="lab-muted lab-xs lab-push">
            {decided}/{project.hypotheses.length} decided · {done} confirmed
          </span>
        </div>
        <div
          className="lab-progress"
          role="img"
          aria-label={`${done} of ${project.hypotheses.length} confirmed`}
        >
          {STAGES.map((s) => {
            const n = project.hypotheses.filter((h) => h.stage === s).length
            return n ? (
              <span key={s} className={`stage-${s}`} style={{ flexGrow: n }} />
            ) : null
          })}
        </div>
        <input
          type="search"
          placeholder="Filter by text, tag, WCAG…"
          aria-label="Filter questions"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Iteration"
          value={iteration}
          onChange={(e) => setIteration(e.target.value)}
        >
          <option value="all">All iterations</option>
          {project.iterations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      <div className="lab-rail-body">
        {ORDER.map((stage) => {
          const items = filtered.filter((h) => h.stage === stage)
          if (!items.length) return null
          const open = !collapsed[stage]
          return (
            <section key={stage} aria-labelledby={`rail-${stage}`}>
              <h3 id={`rail-${stage}`}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setCollapsed({ ...collapsed, [stage]: open })}
                >
                  <span
                    className={`lab-dot stage-${stage}`}
                    aria-hidden="true"
                  />
                  {STAGE_META[stage].label}
                  <span className="lab-muted">{items.length}</span>
                  <span className="lab-push" aria-hidden="true">
                    {open ? "▾" : "▸"}
                  </span>
                </button>
              </h3>
              {open && <ul>{items.map(row)}</ul>}
            </section>
          )
        })}
        {!filtered.length && (
          <p className="lab-muted lab-xs">No questions match.</p>
        )}
      </div>
      <div className="lab-rail-foot">
        <Btn
          variant="outline"
          onClick={() => {
            const id = store.createHypothesis({ title: "New hypothesis" })
            store.selectHypothesis(id, false)
          }}
        >
          New hypothesis from current rig
        </Btn>
      </div>
    </nav>
  )
}
