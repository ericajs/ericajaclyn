// Design Lab app shell.
//
//   ┌ header: project · modes · handoff · people ──────────────────────────┐
//   │ questions │ test rig (target · viewport · tools · switches)  │ review │
//   │ (status   │ canvas (review / compare / flow / matrix)        │ tabs:  │
//   │  by stage)│ inspector · findings drawer                      │ decide │
//   │           │                                                  │ notes  │
//   │           │                                                  │ system │
//   └───────────┴──────────────────────────────────────────────────┴────────┘

import { useEffect, useState } from "react"
import { CVD_MATRICES, feMatrix } from "../engine/switches"
import { BASE_PROJECTS, store, useLab, type Tool } from "../store/store"
import type { Mode } from "../types"
import { LeftRail } from "./LeftRail"
import { awaitingClaude } from "./util"
import { Canvas } from "./Canvas"
import { DecideTab } from "./DecideTab"
import { Header } from "./Header"
import { NotesTab } from "./NotesTab"
import { Dialog, Tabs } from "./primitives"
import { ErrorBoundary } from "./ErrorBoundary"
import { Tooltips } from "./Tooltips"
import { RigBar } from "./RigBar"
import { SystemTab } from "./SystemTab"
import { frames, toasts } from "./bus"
import { buildHandoff } from "../store/handoff"
import { putImage } from "../store/images"
import type { RightTab } from "../store/store"

// Dev-only handle for scripted checks (Playwright) and debugging
if (import.meta.env.DEV)
  (window as unknown as { __lab: unknown }).__lab = {
    store,
    frames,
    buildHandoff,
    putImage,
  }

const KEYS_TOOL: Record<string, Tool> = {
  v: "interact",
  i: "inspect",
  p: "pin",
  b: "box",
  a: "arrow",
  t: "label",
  m: "measure",
}
const KEYS_MODE: Record<string, Mode> = {
  "1": "review",
  "2": "compare",
  "3": "flow",
  "4": "matrix",
  "5": "roadmap",
}

function CvdFilters() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {Object.entries(CVD_MATRICES).map(([k, m]) => (
          <filter
            key={k}
            id={`lab-cvd-${k}`}
            colorInterpolationFilters="linearRGB"
          >
            <feColorMatrix type="matrix" values={feMatrix(m)} />
          </filter>
        ))}
      </defs>
    </svg>
  )
}

function Toasts() {
  const list = toasts.use((t) => t)
  return (
    <div className="lab-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="lab-toast">
          {t.text}
        </div>
      ))}
    </div>
  )
}

function RightPanel() {
  const tab = useLab((s) => s.ui.rightTab)
  const project = useLab((s) => s.project)
  const hId = useLab((s) => s.ui.hypothesisId)
  const openImprovements = project.improvements.filter(
    (i) => i.status === "open"
  ).length
  const tabs: { value: RightTab; label: string; badge?: number }[] = [
    {
      value: "decide",
      label: "Decisions",
      badge: hId && awaitingClaude(project.comments, hId) ? 1 : undefined,
    },
    {
      value: "notes",
      label: "Notes",
      badge: project.notes.length || undefined,
    },
    { value: "system", label: "Improve", badge: openImprovements || undefined },
  ]
  return (
    <aside className="lab-right" aria-label="Review">
      <Tabs
        idBase="right"
        label="Review panel"
        value={tab}
        tabs={tabs}
        onChange={(v) => store.setUI({ rightTab: v })}
      />
      <div
        className="lab-right-body"
        role="tabpanel"
        id={`right-panel-${tab}`}
        aria-labelledby={`right-tab-${tab}`}
        tabIndex={0}
      >
        <ErrorBoundary area="This panel" resetKey={`${tab}:${hId ?? ""}`}>
          {tab === "decide" && <DecideTab />}
          {tab === "notes" && <NotesTab />}
          {tab === "system" && <SystemTab />}
        </ErrorBoundary>
      </div>
    </aside>
  )
}

export default function App() {
  const ui = useLab((s) => s.ui)
  const [help, setHelp] = useState(false)
  // Any change to the test rig or question gives a crashed view a fresh try
  const rigKey = `${ui.hypothesisId ?? ""}:${JSON.stringify(ui.rig)}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as Element | null
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        el?.closest?.("input, textarea, select, [contenteditable=true], dialog")
      )
        return
      const k = e.key
      if (k === "[") store.setUI({ leftOpen: !store.state.ui.leftOpen })
      else if (k === "]") store.setUI({ rightOpen: !store.state.ui.rightOpen })
      else if (k === "\\") {
        const any = store.state.ui.leftOpen || store.state.ui.rightOpen
        store.setUI({ leftOpen: !any, rightOpen: !any })
      } else if (k === "?") setHelp(true)
      else if (k === "f")
        store.setUI({ findingsOpen: !store.state.ui.findingsOpen })
      else if (k === "Escape")
        store.setUI({ tool: "interact", selectedAnnotation: undefined })
      else if (k === "j" || k === "k") {
        const list = store.state.project.hypotheses
        const i = list.findIndex((h) => h.id === store.state.ui.hypothesisId)
        const next =
          list[(i + (k === "j" ? 1 : -1) + list.length) % list.length]
        if (next) store.selectHypothesis(next.id)
      } else if (KEYS_TOOL[k.toLowerCase()])
        store.setUI({ tool: KEYS_TOOL[k.toLowerCase()] })
      else if (KEYS_MODE[k]) store.setMode(KEYS_MODE[k])
      else return
      e.preventDefault()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  if (!BASE_PROJECTS.length)
    return <p className="lab-empty">No projects in src/lab/projects.</p>

  return (
    <div
      className={`lab-app ${ui.leftOpen ? "" : "no-left"} ${ui.rightOpen ? "" : "no-right"}`}
    >
      <CvdFilters />
      <ErrorBoundary area="The header" className="lab-header">
        <Header onHelp={() => setHelp(true)} />
      </ErrorBoundary>
      {ui.leftOpen && (
        <ErrorBoundary area="The questions list" className="lab-rail">
          <LeftRail />
        </ErrorBoundary>
      )}
      <main className="lab-center" aria-label="Design area">
        <ErrorBoundary area="The test rig" resetKey={rigKey}>
          <RigBar />
        </ErrorBoundary>
        <ErrorBoundary area={`The ${ui.rig.mode} view`} resetKey={rigKey}>
          <Canvas />
        </ErrorBoundary>
      </main>
      {ui.rightOpen && <RightPanel />}
      <Toasts />
      <Tooltips />
      <Dialog
        open={help}
        onClose={() => setHelp(false)}
        title="How the lab works"
      >
        <ol className="lab-help">
          <li>
            <strong>Pick a question</strong> on the left. Its test loads:
            target, viewport, mode and switches. The link in the address bar
            reproduces it exactly — share it.
          </li>
          <li>
            <strong>Test around it.</strong> Add or remove switches; chips show
            what deviates from the preset. Save the rig as the preset if Claude
            got the test wrong.
          </li>
          <li>
            <strong>Record evidence</strong> — findings, flow runs,
            observations, screenshots — then your decision. The rig is saved
            with it.
          </li>
          <li>
            <strong>Move the stage</strong> when its exit criterion is met, and{" "}
            <strong>hand off to Claude</strong> to merge, reply and start the
            next iteration.
          </li>
        </ol>
        <table className="lab-keys">
          <tbody>
            {[
              ["1 – 5", "Review · Compare · Flow · Matrix · Roadmap"],
              [
                "V I P B A T M",
                "Interact · Inspect · Pin · Box · Arrow · Label · Measure",
              ],
              ["Alt (inspecting)", "Distance from the selected element"],
              ["J / K", "Next / previous question"],
              ["[  ]  \\", "Questions panel · Review panel · Focus mode"],
              ["F", "Findings drawer"],
              ["Esc", "Back to Interact"],
              [
                "Inside a frame",
                "With a lab tool active, shortcuts still reach the lab. In Interact, keys go to the design you're testing — click the toolbar to take them back.",
              ],
              ["⌘/Ctrl + Enter", "Send comment"],
            ].map(([k, v]) => (
              <tr key={k}>
                <th scope="row">
                  <kbd>{k}</kbd>
                </th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dialog>
    </div>
  )
}
