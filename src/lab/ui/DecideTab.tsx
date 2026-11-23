// Answers & decisions for the selected hypothesis: statement, success
// criteria, the test setup, Claude's recommendation (optionally blind),
// your decision with the rig snapshotted as provenance, evidence, thread.

import { useState } from "react"
import { findSwitch, optionLabel } from "../engine/switches"
import { personName, presetOf, store, uid, useLab } from "../store/store"
import {
  STAGES,
  STAGE_META,
  type CriterionResult,
  type Hypothesis,
  type Stage,
  type Verdict,
} from "../types"
import { toast } from "./bus"
import { Btn, Segmented } from "./primitives"
import { copy, timeAgo } from "./util"
import { targetById, targetLabel } from "./sources"
import { Thread } from "./Thread"
import { vpLabel } from "./viewports"

const VERDICTS: { value: Verdict; label: string }[] = [
  { value: "accept", label: "Accept" },
  { value: "modify", label: "Modify" },
  { value: "reject", label: "Reject" },
  { value: "more-testing", label: "More testing" },
]

const RESULT_NEXT: Record<CriterionResult, CriterionResult> = {
  untested: "pass",
  pass: "fail",
  fail: "untested",
}

export function DecideTab() {
  const project = useLab((s) => s.project)
  const id = useLab((s) => s.ui.hypothesisId)
  const h = project.hypotheses.find((x) => x.id === id)
  if (!h) {
    return (
      <div className="lab-panel-empty">
        <p>
          Select a question on the left, or start one from what&apos;s on the
          canvas.
        </p>
        <Btn
          variant="primary"
          onClick={() =>
            store.selectHypothesis(
              store.createHypothesis({ title: "New hypothesis" }),
              false
            )
          }
        >
          New hypothesis
        </Btn>
      </div>
    )
  }
  return <HypothesisDetail key={h.id} h={h} />
}

function HypothesisDetail({ h }: { h: Hypothesis }) {
  const project = useLab((s) => s.project)
  const ui = useLab((s) => s.ui)
  const [title, setTitle] = useState(h.title)
  const [statement, setStatement] = useState(h.statement)
  const [newCrit, setNewCrit] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [verdict, setVerdict] = useState<Verdict>(
    h.decision?.verdict ?? "accept"
  )
  const [answer, setAnswer] = useState("")
  const [editingDecision, setEditingDecision] = useState(!h.decision)
  const [obs, setObs] = useState("")
  // Follow edits that arrive from elsewhere (merge, import) while open
  const [seen, setSeen] = useState({ title: h.title, statement: h.statement })
  if (seen.title !== h.title || seen.statement !== h.statement) {
    setSeen({ title: h.title, statement: h.statement })
    setTitle(h.title)
    setStatement(h.statement)
  }

  const results =
    h.criteriaResults ??
    h.successCriteria.map(() => "untested" as CriterionResult)
  const preset = presetOf(h, project)
  const target = targetById(project, preset.target)
  const rec = h.recommendation
  const hidden = rec && ui.blind && !h.decision && !revealed
  const stageIdx = STAGES.indexOf(h.stage as (typeof STAGES)[number])
  const next =
    stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null

  const record = () => {
    const rig = store.state.ui.rig
    store.updateHypothesis(h.id, {
      decision: {
        verdict,
        answer: answer.trim(),
        author: ui.identity,
        at: new Date().toISOString(),
        snapshot: { ...rig, switches: { ...rig.switches } },
      },
    })
    setEditingDecision(false)
    toast("Decision recorded with the current rig as evidence")
  }

  return (
    <div className="lab-decide">
      <div className="lab-row lab-gap-2 lab-xs">
        <span className="lab-strong">{h.id}</span>
        <select
          aria-label="Priority"
          value={h.priority ?? ""}
          onChange={(e) =>
            store.updateHypothesis(h.id, {
              priority: (e.target.value || undefined) as Hypothesis["priority"],
            })
          }
        >
          <option value="">No priority</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
          <option value="p3">P3</option>
        </select>
        <select
          aria-label="Iteration"
          value={h.iteration ?? ""}
          onChange={(e) =>
            store.updateHypothesis(h.id, {
              iteration: e.target.value || undefined,
            })
          }
        >
          <option value="">Backlog</option>
          {project.iterations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <span className="lab-muted lab-push">
          by {personName(project, h.createdBy)}
        </span>
      </div>
      <input
        className="lab-title-input"
        aria-label="Hypothesis title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() =>
          title !== h.title && store.updateHypothesis(h.id, { title })
        }
      />

      <section aria-label="Stage">
        <ol className="lab-stepper">
          {STAGES.map((s, i) => (
            <li
              key={s}
              className={`${s === h.stage ? "is-current" : ""} ${stageIdx > i ? "is-past" : ""}`}
            >
              <button
                type="button"
                aria-current={s === h.stage ? "step" : undefined}
                onClick={() => store.setStage(h.id, s)}
                title={STAGE_META[s].exit}
              >
                <span className={`lab-dot stage-${s}`} aria-hidden="true" />
                {STAGE_META[s].label}
              </button>
            </li>
          ))}
        </ol>
        <div className="lab-row lab-gap-2 lab-xs">
          <span className="lab-muted">
            {STAGE_META[h.stage].label}: exit when — {STAGE_META[h.stage].exit}
          </span>
          {(["rejected", "parked"] as Stage[]).map((s) => (
            <button
              key={s}
              type="button"
              className="lab-link-btn"
              aria-pressed={h.stage === s}
              onClick={() => store.setStage(h.id, h.stage === s ? "idea" : s)}
            >
              {h.stage === s
                ? `Un-${s === "rejected" ? "reject" : "park"}`
                : STAGE_META[s].label.replace(/ed$/, "")}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="h-statement">
        <h3 id="h-statement" className="brow">
          Hypothesis
        </h3>
        <textarea
          className="lab-statement"
          aria-labelledby="h-statement"
          rows={4}
          value={statement}
          placeholder="We believe [change] for [people] will [outcome]. We'll know we're right when [signal]."
          onChange={(e) => setStatement(e.target.value)}
          onBlur={() =>
            statement !== h.statement &&
            store.updateHypothesis(h.id, { statement })
          }
        />
        {h.wcag?.length ? (
          <p className="lab-xs">
            WCAG {h.wcag.join(", ")}
            {h.tags?.length ? ` · ${h.tags.join(", ")}` : ""}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="h-criteria">
        <h3 id="h-criteria" className="brow">
          Success criteria
        </h3>
        <ul className="lab-criteria">
          {h.successCriteria.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                className={`lab-crit lab-crit-${results[i]}`}
                aria-label={`${c}: ${results[i]}. Activate to change.`}
                onClick={() =>
                  store.updateHypothesis(h.id, {
                    criteriaResults: results.map((r, j) =>
                      j === i ? RESULT_NEXT[r] : r
                    ),
                  })
                }
              >
                {results[i] === "pass"
                  ? "✓"
                  : results[i] === "fail"
                    ? "✗"
                    : "○"}
              </button>
              <span>{c}</span>
              <button
                type="button"
                className="lab-link-btn lab-push"
                aria-label={`Remove criterion ${c}`}
                onClick={() =>
                  store.updateHypothesis(h.id, {
                    successCriteria: h.successCriteria.filter(
                      (_, j) => j !== i
                    ),
                    criteriaResults: results.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="lab-row lab-gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newCrit.trim()) return
            store.updateHypothesis(h.id, {
              successCriteria: [...h.successCriteria, newCrit.trim()],
              criteriaResults: [...results, "untested"],
            })
            setNewCrit("")
          }}
        >
          <input
            aria-label="New success criterion"
            placeholder="Add a measurable criterion…"
            value={newCrit}
            onChange={(e) => setNewCrit(e.target.value)}
          />
          <Btn type="submit">Add</Btn>
        </form>
      </section>

      <section aria-labelledby="h-test" className="lab-card">
        <div className="lab-row lab-gap-2">
          <h3 id="h-test" className="brow">
            Test setup
          </h3>
          <Btn
            className="lab-push"
            variant="primary"
            onClick={() => store.resetToPreset()}
          >
            Load test
          </Btn>
          <Btn
            onClick={async () =>
              toast(
                (await copy(store.testLink(h, preset)))
                  ? "Test link copied"
                  : "Couldn't copy"
              )
            }
          >
            Copy link
          </Btn>
        </div>
        <p className="lab-xs">
          <strong>{preset.mode}</strong> · {targetLabel(target, preset.props)} ·{" "}
          {vpLabel(preset.viewport!)}
          {preset.matrix?.length
            ? ` · axes: ${preset.matrix.map((a) => `${a.key} (${a.values.length})`).join(" × ")}`
            : ""}
          {preset.flow
            ? ` · flow: ${project.flows.find((f) => f.id === preset.flow)?.name}`
            : ""}
        </p>
        <ul className="lab-chips">
          {Object.entries(preset.switches).map(([k, v]) => {
            const def = findSwitch(k, project)
            return (
              <li
                key={k}
                className={`lab-switch-chip is-preset kind-${def?.kind}`}
              >
                {def?.label ?? k}
                {v !== "on" ? `: ${optionLabel(def, v)}` : ""}
              </li>
            )
          })}
        </ul>
      </section>

      {rec && (
        <section aria-labelledby="h-rec" className="lab-card lab-card-claude">
          <div className="lab-row lab-gap-2">
            <h3 id="h-rec" className="brow">
              ✳ Claude&apos;s recommendation
            </h3>
            <span className={`lab-chip conf-${rec.confidence}`}>
              {rec.confidence} confidence
            </span>
          </div>
          {hidden ? (
            <div>
              <p className="lab-xs lab-muted">
                Blind review is on: record your own take first so the
                recommendation doesn&apos;t anchor it.
              </p>
              <Btn onClick={() => setRevealed(true)}>Reveal anyway</Btn>
            </div>
          ) : (
            <>
              <p className="lab-rec-answer">{rec.answer}</p>
              <p className="lab-xs">{rec.rationale}</p>
              {rec.measured && (
                <p className="lab-xs lab-muted">Measured: {rec.measured}</p>
              )}
              {rec.sources?.length ? (
                <p className="lab-xs">
                  {rec.sources.map((s, i) => (
                    <span key={s.url}>
                      {i > 0 && " · "}
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="link"
                      >
                        {s.label}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}
              {!h.decision && (
                <Btn
                  onClick={() => {
                    setAnswer(rec.answer)
                    setEditingDecision(true)
                  }}
                >
                  Use as my answer
                </Btn>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="h-decision" className="lab-card">
        <h3 id="h-decision" className="brow">
          My decision
        </h3>
        {h.decision && !editingDecision ? (
          <div>
            <p>
              <strong>
                {VERDICTS.find((v) => v.value === h.decision!.verdict)?.label}
              </strong>{" "}
              — {h.decision.answer || <em>no note</em>}
            </p>
            <p className="lab-xs lab-muted">
              {personName(project, h.decision.author)} ·{" "}
              {timeAgo(h.decision.at)} · tested with{" "}
              {Object.keys(h.decision.snapshot.switches).length} switches at{" "}
              {vpLabel(h.decision.snapshot.viewport ?? preset.viewport!)}
            </p>
            <div className="lab-row lab-gap-2">
              <Btn onClick={() => store.setRig(h.decision!.snapshot)}>
                Load decision rig
              </Btn>
              <Btn
                onClick={() => {
                  setAnswer(h.decision!.answer)
                  setVerdict(h.decision!.verdict)
                  setEditingDecision(true)
                }}
              >
                Revise
              </Btn>
              {next && (
                <Btn
                  variant="primary"
                  onClick={() => store.setStage(h.id, next)}
                >
                  Move to {STAGE_META[next].label}
                </Btn>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              record()
            }}
          >
            <Segmented
              label="Verdict"
              value={verdict}
              onChange={setVerdict}
              options={VERDICTS}
              size="sm"
            />
            <textarea
              aria-label="Decision and rationale"
              rows={3}
              placeholder="What did you decide, and why? The current rig is saved with it."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <div className="lab-row lab-gap-2">
              <Btn type="submit" variant="primary">
                Record decision
              </Btn>
              {h.decision && (
                <Btn onClick={() => setEditingDecision(false)}>Cancel</Btn>
              )}
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="h-evidence">
        <h3 id="h-evidence" className="brow">
          Evidence ({h.evidence?.length ?? 0})
        </h3>
        <ul className="lab-evidence">
          {(h.evidence ?? []).map((e) => (
            <li key={e.id}>
              <div className="lab-row lab-gap-2 lab-xs">
                <span className="lab-chip">{e.kind}</span>
                <span className="lab-muted">
                  {personName(project, e.author)} · {timeAgo(e.at)}
                </span>
                {e.snapshot && (
                  <button
                    type="button"
                    className="lab-link-btn lab-push"
                    onClick={() => store.setRig(e.snapshot!)}
                  >
                    Load rig
                  </button>
                )}
                <button
                  type="button"
                  className="lab-link-btn"
                  aria-label="Remove evidence"
                  onClick={() =>
                    store.updateHypothesis(h.id, {
                      evidence: h.evidence.filter((x) => x.id !== e.id),
                    })
                  }
                >
                  ×
                </button>
              </div>
              <p className="lab-pre">{e.body}</p>
            </li>
          ))}
        </ul>
        <form
          className="lab-row lab-gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!obs.trim()) return
            const rig = store.state.ui.rig
            store.updateHypothesis(h.id, {
              evidence: [
                ...(h.evidence ?? []),
                {
                  id: uid("E"),
                  kind: "observation",
                  body: obs.trim(),
                  author: ui.identity,
                  at: new Date().toISOString(),
                  snapshot: { ...rig, switches: { ...rig.switches } },
                },
              ],
            })
            setObs("")
          }}
        >
          <input
            aria-label="Add an observation"
            placeholder="Add an observation (saved with the current rig)…"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
          <Btn type="submit">Add</Btn>
        </form>
      </section>

      <section aria-labelledby="h-thread">
        <h3 id="h-thread" className="brow">
          Discussion
        </h3>
        <Thread thread={h.id} />
      </section>
    </div>
  )
}
