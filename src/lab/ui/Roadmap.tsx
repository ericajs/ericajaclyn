// Agile design roadmap: where we are (active iteration, what's under test),
// the iteration timeline, and the decision lifecycle board.

import { useState } from "react"
import { store, useLab } from "../store/store"
import {
  STAGES,
  STAGE_META,
  type Hypothesis,
  type Iteration,
  type Stage,
} from "../types"
import { Btn, Segmented } from "./primitives"

const ALL_STAGES: Stage[] = [...STAGES, "rejected", "parked"]

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function StageBar({ items }: { items: Hypothesis[] }) {
  if (!items.length)
    return <div className="lab-stagebar lab-stagebar-empty">No hypotheses</div>
  return (
    <div className="lab-stagebar-wrap">
      <div
        className="lab-stagebar"
        role="img"
        aria-label={ALL_STAGES.map(
          (s) =>
            `${STAGE_META[s].label} ${items.filter((h) => h.stage === s).length}`
        ).join(", ")}
      >
        {ALL_STAGES.map((s) => {
          const n = items.filter((h) => h.stage === s).length
          return n ? (
            <span
              key={s}
              className={`stage-${s}`}
              style={{ flexGrow: n }}
              title={`${STAGE_META[s].label}: ${n}`}
            />
          ) : null
        })}
      </div>
      <div className="lab-stagebar-legend">
        {ALL_STAGES.map((s) => {
          const n = items.filter((h) => h.stage === s).length
          return n ? (
            <span key={s}>
              <span className={`lab-dot stage-${s}`} aria-hidden="true" />{" "}
              {STAGE_META[s].label} {n}
            </span>
          ) : null
        })}
      </div>
    </div>
  )
}

function Card({ h, move }: { h: Hypothesis; move?: boolean }) {
  const i = STAGES.indexOf(h.stage as (typeof STAGES)[number])
  return (
    <li className="lab-road-card">
      <button
        type="button"
        className="lab-road-open"
        onClick={() => store.selectHypothesis(h.id)}
      >
        <span className={`lab-dot stage-${h.stage}`} aria-hidden="true" />
        <span className="lab-muted">{h.id}</span> {h.title}
      </button>
      <div className="lab-row lab-gap-2 lab-xs">
        {h.priority && (
          <span className="lab-chip">{h.priority.toUpperCase()}</span>
        )}
        {h.decision && (
          <span className="lab-chip lab-chip-pass">
            Decided: {h.decision.verdict}
          </span>
        )}
        <span className="lab-muted">{STAGE_META[h.stage].label}</span>
        {move && i >= 0 && (
          <span className="lab-push lab-row lab-gap-1">
            <button
              type="button"
              className="lab-link-btn"
              disabled={i <= 0}
              aria-label={`Move ${h.id} back to ${STAGES[i - 1] ?? ""}`}
              onClick={() => store.setStage(h.id, STAGES[i - 1])}
            >
              ←
            </button>
            <button
              type="button"
              className="lab-link-btn"
              disabled={i >= STAGES.length - 1}
              aria-label={`Move ${h.id} forward to ${STAGES[i + 1] ?? ""}`}
              onClick={() => store.setStage(h.id, STAGES[i + 1])}
            >
              →
            </button>
          </span>
        )}
      </div>
    </li>
  )
}

export function Roadmap() {
  const project = useLab((s) => s.project)
  const [view, setView] = useState<"timeline" | "board">("timeline")
  const iterations = [...project.iterations].sort((a, b) =>
    a.start.localeCompare(b.start)
  )
  const active = iterations.find((i) => i.status === "active")
  const today = new Date().toISOString().slice(0, 10)
  const testing = project.hypotheses.filter((h) => h.stage === "testing")
  const inIt = (it: Iteration) =>
    project.hypotheses.filter((h) => h.iteration === it.id)

  return (
    <div className="lab-roadmap">
      <section className="lab-road-now" aria-labelledby="road-now">
        <div>
          <p className="brow" id="road-now">
            Where we are
          </p>
          {active ? (
            <>
              <h2 className="lab-road-title">{active.name}</h2>
              <p>{active.goal}</p>
              <p className="lab-muted lab-xs">
                {active.start} → {active.end} · day{" "}
                {Math.max(0, daysBetween(active.start, today)) + 1} of{" "}
                {daysBetween(active.start, active.end) + 1}
                {active.version ? ` · ships as v${active.version}` : ""}
              </p>
              <StageBar items={inIt(active)} />
            </>
          ) : (
            <p>No active iteration.</p>
          )}
        </div>
        <div>
          <p className="brow">Being tested now ({testing.length})</p>
          <ul className="lab-road-list">
            {testing.map((h) => (
              <li key={h.id}>
                <span>
                  <span className="lab-muted">{h.id}</span> {h.title}
                </span>
                <Btn onClick={() => store.selectHypothesis(h.id)}>
                  Open test
                </Btn>
              </li>
            ))}
            {!testing.length && (
              <li className="lab-muted">Nothing in testing.</li>
            )}
          </ul>
        </div>
      </section>

      <div className="lab-row lab-gap-2">
        <Segmented
          label="Roadmap view"
          value={view}
          onChange={setView}
          options={[
            { value: "timeline", label: "Iterations" },
            { value: "board", label: "Lifecycle board" },
          ]}
        />
        <span className="lab-muted lab-xs">
          Stage exits:{" "}
          {STAGES.map(
            (s) => `${STAGE_META[s].label} — ${STAGE_META[s].exit}`
          ).join("  ·  ")}
        </span>
      </div>

      {view === "timeline" ? (
        <div
          className="lab-road-columns"
          tabIndex={0}
          role="region"
          aria-label="Iterations"
        >
          {iterations.map((it) => {
            const items = inIt(it)
            return (
              <section
                key={it.id}
                className={`lab-road-col is-${it.status}`}
                aria-labelledby={`it-${it.id}`}
              >
                <header>
                  <span
                    className={`lab-chip ${it.status === "active" ? "lab-chip-claude" : ""}`}
                  >
                    {it.status}
                  </span>
                  <h3 id={`it-${it.id}`}>{it.name}</h3>
                  <p className="lab-xs lab-muted">
                    {it.start} → {it.end}
                    {it.version ? ` · v${it.version}` : ""}
                  </p>
                  <p className="lab-xs">{it.goal}</p>
                  <StageBar items={items} />
                </header>
                <ul>
                  {items.map((h) => (
                    <Card key={h.id} h={h} />
                  ))}
                </ul>
              </section>
            )
          })}
          {project.hypotheses.some((h) => !h.iteration) && (
            <section className="lab-road-col" aria-labelledby="it-none">
              <header>
                <h3 id="it-none">Backlog</h3>
                <p className="lab-xs lab-muted">Not assigned to an iteration</p>
              </header>
              <ul>
                {project.hypotheses
                  .filter((h) => !h.iteration)
                  .map((h) => (
                    <Card key={h.id} h={h} />
                  ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div
          className="lab-road-columns lab-board"
          tabIndex={0}
          role="region"
          aria-label="Lifecycle board"
        >
          {ALL_STAGES.map((s) => {
            const items = project.hypotheses.filter((h) => h.stage === s)
            return (
              <section
                key={s}
                className="lab-road-col"
                aria-labelledby={`st-${s}`}
              >
                <header>
                  <h3 id={`st-${s}`}>
                    <span className={`lab-dot stage-${s}`} aria-hidden="true" />{" "}
                    {STAGE_META[s].label}{" "}
                    <span className="lab-muted">{items.length}</span>
                  </h3>
                  <p className="lab-xs lab-muted">{STAGE_META[s].exit}</p>
                </header>
                <ul>
                  {items.map((h) => (
                    <Card key={h.id} h={h} move />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
