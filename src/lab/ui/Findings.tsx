// Findings drawer: what the active checks found in the primary frame, with
// one-click promotion to annotations or evidence on the open hypothesis.

import { useState } from "react"
import { anchorAt } from "../engine/anchor"
import type { Analysis, Finding } from "../engine/analyze"
import { findSwitch, type SwitchDef } from "../engine/switches"
import { store, uid, useLab } from "../store/store"
import type { Annotation, Evidence } from "../types"
import { frames, toast } from "./bus"
import { Btn } from "./primitives"
import { designSource, targetById } from "./sources"

const SEV_TEXT = { fail: "Fail", warn: "Check", info: "Info", pass: "Pass" }

function addEvidence(
  body: string,
  kind: Evidence["kind"] = "finding",
  data?: Record<string, unknown>
) {
  const h = store.hypothesis()
  if (!h) {
    toast("Select a hypothesis to attach evidence to")
    return
  }
  const rig = store.state.ui.rig
  const ev: Evidence = {
    id: uid("E"),
    kind,
    body,
    author: store.state.ui.identity,
    at: new Date().toISOString(),
    snapshot: { ...rig, switches: { ...rig.switches } },
    data,
  }
  store.updateHypothesis(h.id, { evidence: [...(h.evidence ?? []), ev] })
  toast(`Added to ${h.id} as evidence`)
}

function pinFinding(f: Finding, frameKey: string) {
  const doc = frames.get()[frameKey]?.doc
  const target = store.state.ui.rig.target
  if (!doc || !f.el?.isConnected || !target) return
  const r = f.el.getBoundingClientRect()
  const w = doc.defaultView!
  const p = anchorAt(
    doc,
    r.left + Math.min(8, r.width / 2),
    r.top + Math.min(8, r.height / 2),
    w.scrollX,
    w.scrollY
  )
  const mine = store.state.project.annotations.filter(
    (a) => a.target === target
  )
  const a: Annotation = {
    id: uid("A"),
    target,
    kind: "pin",
    category: f.severity === "fail" ? "issue" : "question",
    points: [p],
    text: f.message + (f.wcag?.length ? ` (WCAG ${f.wcag.join(", ")})` : ""),
    number: Math.max(0, ...mine.map((x) => x.number)) + 1,
    hypothesis: store.state.ui.hypothesisId,
    viewportW: w.innerWidth,
    author: store.state.ui.identity,
    at: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.upsert("annotations", a)
  toast(`Pinned as #${a.number}`)
}

export function Findings() {
  const ui = useLab((s) => s.ui)
  const project = useLab((s) => s.project)
  const all = frames.use((f) => f)
  const mode = ui.rig.mode
  const frameKey = mode === "flow" && all["flow-run"] ? "flow-run" : "design"
  const info = all[frameKey]
  const analyses = info?.analyses ?? {}
  const guides = Object.keys(ui.rig.switches)
    .map((id) => findSwitch(id, project))
    .filter((s): s is SwitchDef => !!s && s.kind === "guide")
  const tabs = [...Object.keys(analyses), ...guides.map((g) => g.id)]
  const [tab, setTab] = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)
  const active = tab && tabs.includes(tab) ? tab : tabs[0]

  if (mode === "matrix") return <BatchSummary />
  if (!tabs.length && !info?.unsupported?.length) return null

  const fails = Object.values(analyses).reduce(
    (n, a) => n + a.findings.filter((f) => f.severity === "fail").length,
    0
  )

  return (
    <section
      className={`lab-findings ${ui.findingsOpen ? "is-open" : ""}`}
      aria-label="Findings"
    >
      <button
        type="button"
        className="lab-findings-toggle"
        aria-expanded={ui.findingsOpen}
        onClick={() => store.setUI({ findingsOpen: !ui.findingsOpen })}
      >
        <span>Findings</span>
        <span className="lab-muted">
          {Object.keys(analyses).length} checks · {fails} failures
          {guides.length ? ` · ${guides.length} manual` : ""}
        </span>
        {info?.unsupported?.length ? (
          <span className="lab-chip lab-chip-warn">
            {info.unsupported.length} switches can't reach this cross-origin
            frame
          </span>
        ) : null}
        <span className="lab-push" aria-hidden="true">
          {ui.findingsOpen ? "▾" : "▴"}
        </span>
      </button>
      {ui.findingsOpen && (
        <div className="lab-findings-body">
          <div className="lab-findings-tabs" role="tablist" aria-label="Checks">
            {tabs.map((id) => {
              const a = analyses[id]
              const n =
                a?.findings.filter((f) => f.severity === "fail").length ?? 0
              return (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={id === active}
                  onClick={() => setTab(id)}
                >
                  {findSwitch(id, project)?.label ?? id}
                  {n > 0 && (
                    <span className="lab-badge lab-badge-fail">{n}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="lab-findings-panel" role="tabpanel">
            {active && analyses[active] && (
              <AnalysisPanel
                a={analyses[active]}
                frameKey={frameKey}
                showPass={showPass}
                setShowPass={setShowPass}
              />
            )}
            {active && !analyses[active] && active === "nielsen" && <Nielsen />}
            {active && !analyses[active] && active !== "nielsen" && (
              <Guide def={findSwitch(active, project)!} />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function AnalysisPanel({
  a,
  frameKey,
  showPass,
  setShowPass,
}: {
  a: Analysis
  frameKey: string
  showPass: boolean
  setShowPass: (v: boolean) => void
}) {
  const shown = a.findings.filter((f) => showPass || f.severity !== "pass")
  const bad = a.findings.filter(
    (f) => f.severity === "fail" || f.severity === "warn"
  )
  return (
    <>
      <div className="lab-row lab-gap-2 lab-wrap">
        <strong>{a.summary}</strong>
        <label className="lab-check">
          <input
            type="checkbox"
            checked={showPass}
            onChange={(e) => setShowPass(e.target.checked)}
          />{" "}
          Show passes
        </label>
        <Btn
          className="lab-push"
          onClick={() =>
            addEvidence(
              `${findSwitch(a.switchId)?.label ?? a.switchId}: ${a.summary}${
                bad.length
                  ? `\n${bad
                      .slice(0, 15)
                      .map((f) => `- [${f.severity}] ${f.message}`)
                      .join("\n")}`
                  : ""
              }`
            )
          }
        >
          Add summary as evidence
        </Btn>
      </div>
      {a.outline && (
        <ol className="lab-outline" aria-label="Heading outline">
          {a.outline.map((o, i) => (
            <li key={i} style={{ paddingInlineStart: (o.level - 1) * 14 }}>
              <span className="lab-muted">h{o.level}</span>{" "}
              {o.text || <em>empty</em>}
            </li>
          ))}
        </ol>
      )}
      <ul className="lab-finding-list">
        {shown.slice(0, 300).map((f) => (
          <li key={f.id} className={`sev-${f.severity}`}>
            <span className="lab-sev">{SEV_TEXT[f.severity]}</span>
            <span className="lab-finding-msg">
              {f.message}
              {f.wcag?.map((w) => (
                <a
                  key={w}
                  className="lab-chip"
                  href={`https://www.w3.org/WAI/WCAG22/quickref/#${wcagSlug(w)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {w}
                </a>
              ))}
            </span>
            <span className="lab-finding-actions">
              {f.el && (
                <button
                  type="button"
                  className="lab-link-btn"
                  onClick={() =>
                    f.el?.scrollIntoView({
                      block: "center",
                      behavior: "smooth",
                    })
                  }
                >
                  Locate
                </button>
              )}
              {f.el && (
                <button
                  type="button"
                  className="lab-link-btn"
                  onClick={() => pinFinding(f, frameKey)}
                >
                  Pin
                </button>
              )}
              <button
                type="button"
                className="lab-link-btn"
                onClick={() =>
                  addEvidence(
                    `[${f.severity}] ${f.message}${f.selector ? ` — ${f.selector}` : ""}`
                  )
                }
              >
                Evidence
              </button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

// Quickref anchors are names, not numbers; link to the search for the SC number when unknown
const SC_SLUGS: Record<string, string> = {
  "1.1.1": "non-text-content",
  "1.3.1": "info-and-relationships",
  "1.4.1": "use-of-color",
  "1.4.3": "contrast-minimum",
  "1.4.4": "resize-text",
  "1.4.6": "contrast-enhanced",
  "1.4.10": "reflow",
  "1.4.11": "non-text-contrast",
  "1.4.12": "text-spacing",
  "2.1.1": "keyboard",
  "2.2.2": "pause-stop-hide",
  "2.3.3": "animation-from-interactions",
  "2.4.1": "bypass-blocks",
  "2.4.3": "focus-order",
  "2.4.4": "link-purpose-in-context",
  "2.4.6": "headings-and-labels",
  "2.4.7": "focus-visible",
  "2.4.11": "focus-not-obscured-minimum",
  "2.5.3": "label-in-name",
  "2.5.5": "target-size-enhanced",
  "2.5.8": "target-size-minimum",
  "3.1.5": "reading-level",
  "4.1.2": "name-role-value",
  "4.1.3": "status-messages",
}
function wcagSlug(sc: string) {
  return SC_SLUGS[sc] ?? ""
}

function Guide({ def }: { def: SwitchDef }) {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const [obs, setObs] = useState("")
  const src = designSource(targetById(project, rig.target), rig.props)
  const href = src && src.kind !== "proxy" ? src.url : undefined
  return (
    <div className="lab-guide">
      <p>{def.description}</p>
      <ol>
        {def.guide?.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ol>
      {href && (
        <a
          className="lab-btn lab-btn-outline"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          Open frame in a new tab ↗
        </a>
      )}
      <form
        className="lab-row lab-gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!obs.trim()) return
          addEvidence(`${def.label}: ${obs.trim()}`, "observation")
          setObs("")
        }}
      >
        <input
          aria-label={`${def.label} observation`}
          placeholder="What did you observe?"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
        <Btn type="submit">Log as evidence</Btn>
      </form>
    </div>
  )
}

// Nielsen, "10 Usability Heuristics for User Interface Design" (1994, updated 2024),
// with his 0–4 severity scale.
const HEURISTICS = [
  "Visibility of system status",
  "Match between the system and the real world",
  "User control and freedom",
  "Consistency and standards",
  "Error prevention",
  "Recognition rather than recall",
  "Flexibility and efficiency of use",
  "Aesthetic and minimalist design",
  "Help users recognize, diagnose, and recover from errors",
  "Help and documentation",
]
const SEVERITY = [
  "0 · Not a problem",
  "1 · Cosmetic",
  "2 · Minor",
  "3 · Major",
  "4 · Catastrophe",
]

function Nielsen() {
  const [scores, setScores] = useState<(number | null)[]>(
    HEURISTICS.map(() => null)
  )
  const [notes, setNotes] = useState<string[]>(HEURISTICS.map(() => ""))
  const rated = scores.filter((s) => s !== null).length
  return (
    <div className="lab-nielsen">
      <table>
        <thead>
          <tr>
            <th scope="col">Heuristic</th>
            <th scope="col">Severity</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {HEURISTICS.map((h, i) => (
            <tr key={h}>
              <th scope="row">
                {i + 1}. {h}
              </th>
              <td>
                <select
                  aria-label={`Severity for ${h}`}
                  value={scores[i] ?? ""}
                  onChange={(e) =>
                    setScores(
                      scores.map((s, j) =>
                        j === i
                          ? e.target.value === ""
                            ? null
                            : +e.target.value
                          : s
                      )
                    )
                  }
                >
                  <option value="">Not rated</option>
                  {SEVERITY.map((s, n) => (
                    <option key={n} value={n}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  aria-label={`Note for ${h}`}
                  value={notes[i]}
                  onChange={(e) =>
                    setNotes(
                      notes.map((x, j) => (j === i ? e.target.value : x))
                    )
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Btn
        variant="primary"
        disabled={!rated}
        onClick={() =>
          addEvidence(
            `Heuristic evaluation (${rated}/10 rated): ${HEURISTICS.map(
              (h, i) =>
                scores[i] !== null
                  ? `${i + 1}. ${h} = ${scores[i]}${notes[i] ? ` (${notes[i]})` : ""}`
                  : null
            )
              .filter(Boolean)
              .join("; ")}`,
            "observation",
            {
              heuristics: HEURISTICS.map((h, i) => ({
                heuristic: h,
                severity: scores[i],
                note: notes[i],
              })),
            }
          )
        }
      >
        Save evaluation as evidence
      </Btn>
    </div>
  )
}

function BatchSummary() {
  const all = frames.use((f) => f)
  const project = useLab((s) => s.project)
  const cells = Object.values(all).filter(
    (f) => f.key.startsWith("mx-") && Object.keys(f.analyses).length
  )
  if (!cells.length) return null
  const checks = [...new Set(cells.flatMap((c) => Object.keys(c.analyses)))]
  return (
    <section className="lab-findings is-open" aria-label="Batch results">
      <div className="lab-findings-toggle">
        <span>Batch results</span>
        <span className="lab-muted">failures per cell</span>
        <Btn
          className="lab-push"
          onClick={() =>
            addEvidence(
              `Batch: ${cells.map((c) => `${c.label.split(" — ").pop()}: ${checks.map((k) => `${k} ${c.analyses[k]?.findings.filter((f) => f.severity === "fail").length ?? "–"}`).join(", ")}`).join(" | ")}`,
              "metric"
            )
          }
        >
          Add batch as evidence
        </Btn>
      </div>
      <div className="lab-findings-body">
        <table className="lab-batch">
          <thead>
            <tr>
              <th scope="col">Cell</th>
              {checks.map((k) => (
                <th key={k} scope="col">
                  {findSwitch(k, project)?.label ?? k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.key}>
                <th scope="row">{c.label.split(" — ").pop()}</th>
                {checks.map((k) => {
                  const n = c.analyses[k]?.findings.filter(
                    (f) => f.severity === "fail"
                  ).length
                  return (
                    <td key={k} className={n ? "sev-fail" : "sev-pass"}>
                      {n ?? "–"}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
