// Flows: a storyboard of every step under the same switches (batch-test a
// whole interaction flow), and a timed run of the live flow that records
// task success and time on task as evidence (ISO 9241-11 effectiveness and
// efficiency measures).

import { useEffect, useRef, useState } from "react"
import { store, uid, useLab } from "../store/store"
import type { Evidence, Flow } from "../types"
import { frames } from "./bus"
import { FrameView } from "./FrameView"
import { Btn, Segmented, TextField } from "./primitives"
import { designSource, targetById, useBox } from "./sources"
import { failCounts } from "./util"

type StepStatus = "pending" | "current" | "done" | "failed"

export function FlowView() {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const [view, setView] = useState<"storyboard" | "run">("storyboard")
  const flow = project.flows.find((f) => f.id === rig.flow) ?? project.flows[0]
  if (!flow)
    return (
      <p className="lab-empty">
        This project has no flows yet. Add one to the project file.
      </p>
    )
  return (
    <div className="lab-stage-wrap">
      <div className="lab-compare-bar">
        <label className="lab-inline-field">
          Flow
          <select
            value={flow.id}
            onChange={(e) => store.setRig({ flow: e.target.value })}
          >
            {project.flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          label="Flow view"
          value={view}
          onChange={setView}
          options={[
            { value: "storyboard", label: "Storyboard" },
            { value: "run", label: "Run it" },
          ]}
        />
        <span className="lab-muted lab-xs">Goal: {flow.goal}</span>
      </div>
      {view === "storyboard" ? (
        <Storyboard flow={flow} />
      ) : (
        <FlowRun flow={flow} />
      )}
    </div>
  )
}

function Storyboard({ flow }: { flow: Flow }) {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const reloadKey = useLab((s) => s.ui.reloadKey)
  const all = frames.use((f) => f)
  const vp = rig.viewport!
  const cardW = 300
  const cardH = Math.min(420, Math.round((cardW * vp.h) / vp.w))
  return (
    <div
      className="lab-storyboard"
      role="list"
      aria-label={`${flow.name} steps`}
      tabIndex={0}
    >
      {flow.steps.map((step, i) => {
        const t = targetById(project, step.target)
        const src = designSource(t)
        const key = `flow-${flow.id}-${i}`
        const fails = failCounts(all[key]?.analyses)
        return (
          <div key={key} className="lab-story-step" role="listitem">
            <div className="lab-story-card">
              <div className="lab-story-head">
                <span className="lab-step-num">{i + 1}</span>
                <strong>{step.label}</strong>
                <button
                  type="button"
                  className="lab-link-btn lab-push"
                  onClick={() =>
                    store.setRig({ mode: "review", target: step.target })
                  }
                >
                  Review
                </button>
              </div>
              {src && (
                <FrameView
                  frameKey={key}
                  label={`Step ${i + 1}: ${step.label}`}
                  source={src}
                  viewport={vp}
                  switches={rig.switches}
                  box={{ w: cardW, h: cardH }}
                  project={project}
                  annotationsTarget={t?.id}
                  reloadKey={reloadKey}
                />
              )}
              <div className="lab-story-foot">
                {fails.length ? (
                  fails.map((f) => (
                    <span key={f.id} className="lab-chip lab-chip-fail">
                      {f.id}: {f.n}
                    </span>
                  ))
                ) : (
                  <span className="lab-muted lab-xs">
                    {Object.keys(all[key]?.analyses ?? {}).length
                      ? "No failures"
                      : "Turn on checks to batch-test every step"}
                  </span>
                )}
              </div>
            </div>
            {i < flow.steps.length - 1 && (
              <div
                className="lab-story-arrow"
                aria-label={step.action ? `then: ${step.action}` : "then"}
              >
                <svg
                  width="56"
                  height="24"
                  viewBox="0 0 56 24"
                  aria-hidden="true"
                >
                  <path
                    d="M2 12 H50 M42 4 L52 12 L42 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                {step.action && <span>{step.action}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FlowRun({ flow }: { flow: Flow }) {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const hypothesisId = useLab((s) => s.ui.hypothesisId)
  const [status, setStatus] = useState<StepStatus[]>(() =>
    flow.steps.map((_, i) => (i === 0 ? "current" : "pending"))
  )
  const [times, setTimes] = useState<number[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [note, setNote] = useState("")
  const start = useRef(0)
  const stepStart = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const path = frames.use((f) => f["flow-run"]?.path)
  const [stageRef, stageBox] = useBox<HTMLDivElement>()
  const box = { w: stageBox.w - 32, h: stageBox.h - 32 }
  const first = targetById(project, flow.steps[0].target)
  const src = designSource(first)
  const current = status.indexOf("current")
  const finished = current === -1

  useEffect(() => {
    start.current = stepStart.current = performance.now()
    const t = setInterval(
      () => setElapsed(performance.now() - start.current),
      500
    )
    return () => clearInterval(t)
  }, [])

  const advance = (result: "done" | "failed") => {
    if (finished) return
    const ms = Math.round(performance.now() - stepStart.current)
    stepStart.current = performance.now()
    setTimes((t) => [...t, ms])
    setStatus((st) =>
      st.map((v, i) =>
        i === current ? result : i === current + 1 ? "current" : v
      )
    )
  }

  // Auto-advance: the live frame reached the next step's route
  useEffect(() => {
    if (finished || !path) return
    const next = targetById(project, flow.steps[current + 1]?.target)
    if (
      next?.kind === "route" &&
      path.replace(/\/$/, "") === next.path.replace(/\/$/, "")
    )
      advance("done")
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const h = project.hypotheses.find((x) => x.id === hypothesisId)
    if (!h) return
    const total = Math.round(performance.now() - start.current)
    const ok = status.every((s) => s === "done" || s === "current")
    const ev: Evidence = {
      id: uid("E"),
      kind: "flow-run",
      body: `${flow.name}: ${status.filter((s) => s === "done").length}/${flow.steps.length - 1} transitions completed, ${(total / 1000).toFixed(1)}s total${notes.length ? `. Issues: ${notes.join("; ")}` : ""}`,
      author: store.state.ui.identity,
      at: new Date().toISOString(),
      ...store.provenance(),
      data: {
        flow: flow.id,
        success: ok,
        steps: flow.steps.map((s, i) => ({
          label: s.label,
          status: status[i],
          ms: times[i] ?? null,
        })),
        totalMs: total,
        notes,
      },
    }
    store.updateHypothesis(h.id, { evidence: [...(h.evidence ?? []), ev] })
  }

  return (
    <div className="lab-run">
      <div className="lab-stage" ref={stageRef}>
        {src && (
          <FrameView
            frameKey="flow-run"
            label={`Flow run: ${flow.name}`}
            source={src}
            viewport={rig.viewport!}
            switches={rig.switches}
            box={box}
            project={project}
            annotationsTarget={first?.id}
            tools
          />
        )}
      </div>
      <aside className="lab-run-panel" aria-label="Flow run">
        <p className="lab-muted lab-xs">
          Work through the flow in the frame as a first-time visitor would.
          Steps advance on their own when the frame reaches the next route; use
          the buttons for steps without a route change.
        </p>
        <ol className="lab-run-steps">
          {flow.steps.map((s, i) => (
            <li key={i} className={`is-${status[i]}`}>
              <span className="lab-step-num">{i + 1}</span>
              <span>
                {s.label}
                {s.action && status[i] === "current" && (
                  <span className="lab-muted lab-xs"> — next: {s.action}</span>
                )}
              </span>
              {times[i] !== undefined && (
                <span className="lab-muted lab-xs lab-push">
                  {(times[i] / 1000).toFixed(1)}s
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="lab-strong">{(elapsed / 1000).toFixed(0)}s elapsed</p>
        <div className="lab-row lab-gap-2 lab-wrap">
          <Btn
            variant="primary"
            onClick={() => advance("done")}
            disabled={finished}
          >
            Step done
          </Btn>
          <Btn onClick={() => advance("failed")} disabled={finished}>
            Couldn't do it
          </Btn>
        </div>
        <form
          className="lab-row lab-gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim())
              setNotes((n) => [...n, `Step ${current + 1}: ${note.trim()}`])
            setNote("")
          }}
        >
          <TextField
            label="Issue"
            placeholder="Issue observed"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Btn type="submit">Log</Btn>
        </form>
        {notes.length > 0 && (
          <ul className="lab-xs">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <Btn
          variant="primary"
          onClick={save}
          disabled={!hypothesisId}
          title={hypothesisId ? "" : "Select a hypothesis first"}
        >
          Save run as evidence{hypothesisId ? ` on ${hypothesisId}` : ""}
        </Btn>
      </aside>
    </div>
  )
}
