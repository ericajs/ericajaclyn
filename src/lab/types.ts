// Design Lab data model.
//
// Two kinds of data share these types:
//   1. Project files (src/lab/projects/*.json) — written by Claude in the repo,
//      the source of truth that ships with each preview build.
//   2. The local overlay (browser) — what you and invited contributors add while
//      reviewing. It is merged over the project file by id + updatedAt and
//      handed back to Claude as a handoff file (see store/handoff.ts).

/** Lifecycle of a design decision. Order matters: it drives the stepper and roadmap. */
export const STAGES = [
  "idea",
  "tentative",
  "testing",
  "validated",
  "verified",
  "confirmed",
] as const
export type ActiveStage = (typeof STAGES)[number]
export type Stage = ActiveStage | "rejected" | "parked"

export const STAGE_META: Record<Stage, { label: string; exit: string }> = {
  idea: {
    label: "Idea",
    exit: "Written as a falsifiable hypothesis with success criteria.",
  },
  tentative: {
    label: "Tentative",
    exit: "A candidate design exists and a test setup is attached.",
  },
  testing: {
    label: "Testing",
    exit: "Every success criterion has been run under its test setup.",
  },
  validated: {
    label: "Validated",
    exit: "Evidence shows it is the right thing for people (user need met).",
  },
  verified: {
    label: "Verified",
    exit: "The built thing matches spec and standards (WCAG, tokens, production parity).",
  },
  confirmed: {
    label: "Confirmed",
    exit: "Decision recorded and assigned to a version.",
  },
  rejected: {
    label: "Rejected",
    exit: "Evidence contradicted the hypothesis.",
  },
  parked: { label: "Parked", exit: "Deliberately deferred." },
}

export type Role = "owner" | "claude" | "contributor"

export interface Person {
  id: string
  name: string
  role: Role
  /** Contributors only: the token in their invite link. Identity, not access control. */
  invite?: { token: string; createdAt: string; acceptedAt?: string }
  updatedAt?: string
}

/** switchId → value. Boolean switches use "on". */
export type SwitchState = Record<string, string>

export type Mode = "review" | "compare" | "flow" | "matrix" | "roadmap"
export type CompareLayout = "side" | "swipe" | "onion" | "diff"

export interface ViewportSpec {
  /** Device width in CSS px before zoom. */
  w: number
  h: number
  /** Browser zoom. CSS viewport = w / zoom (how real page zoom behaves). */
  zoom: number
}

export interface MatrixAxis {
  kind: "prop" | "switch" | "viewport" | "target"
  /** prop name, switch id, or "viewport" / "target" */
  key: string
  values: string[]
}

/** Everything needed to reproduce what you were looking at. Encoded in test links. */
export interface TestSetup {
  mode: Mode
  target?: string
  flow?: string
  /** Component permutation (prop → value) when the target is a component. */
  props?: Record<string, string>
  switches: SwitchState
  viewport?: ViewportSpec
  compare?: CompareLayout
  matrix?: MatrixAxis[]
}

export interface Source {
  label: string
  url: string
}

export interface Recommendation {
  answer: string
  rationale: string
  confidence: "low" | "medium" | "high"
  /** What Claude actually measured, if anything, so you can re-run it. */
  measured?: string
  sources?: Source[]
  author: string
  at: string
}

export type Verdict = "accept" | "modify" | "reject" | "more-testing"

export interface Decision {
  verdict: Verdict
  answer: string
  author: string
  at: string
  /** The rig at the moment of deciding — provenance for the evidence. */
  snapshot: TestSetup
}

export interface Evidence {
  id: string
  kind: "observation" | "finding" | "flow-run" | "screenshot" | "metric"
  body: string
  author: string
  at: string
  snapshot?: TestSetup
  /** Image refs: "idb:<id>" (local) or "asset:<file>" (merged into repo). */
  images?: string[]
  /** Optional structured result, e.g. a flow run. */
  data?: Record<string, unknown>
}

export type CriterionResult = "untested" | "pass" | "fail"

export interface Hypothesis {
  id: string
  title: string
  /** "We believe … for … will … We'll know when …" */
  statement: string
  successCriteria: string[]
  /** Parallel to successCriteria. */
  criteriaResults?: CriterionResult[]
  stage: Stage
  iteration?: string
  priority?: "p1" | "p2" | "p3"
  tags?: string[]
  wcag?: string[]
  test: TestSetup
  recommendation?: Recommendation
  decision?: Decision
  evidence: Evidence[]
  stageHistory: { stage: Stage; at: string; by: string }[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AnnotationKind = "pin" | "box" | "arrow" | "label" | "measure"
export type AnnotationCategory =
  | "issue"
  | "question"
  | "spec"
  | "idea"
  | "praise"

/** A point anchored to a DOM element when the frame is same-origin. */
export interface AnchoredPoint {
  /** Fallback document coordinates (frame CSS px, including scroll). */
  x: number
  y: number
  anchor?: { selector: string; fx: number; fy: number }
}

export interface Annotation {
  id: string
  /** Target id, or "note:<noteId>:<imageRef>" for marks on a pasted screenshot. */
  target: string
  kind: AnnotationKind
  category: AnnotationCategory
  points: AnchoredPoint[]
  text?: string
  number: number
  hypothesis?: string
  /** CSS viewport width it was drawn at; anchors survive resizing, raw coords don't. */
  viewportW?: number
  resolved?: boolean
  author: string
  at: string
  updatedAt: string
}

export interface Comment {
  id: string
  /** Entity the thread hangs off: hypothesis, annotation, note or improvement id. */
  thread: string
  author: string
  body: string
  /** Ask Claude to respond in the next handoff. */
  needsClaude?: boolean
  at: string
  updatedAt: string
}

export interface Note {
  id: string
  title: string
  body: string
  images: string[]
  hypothesis?: string
  target?: string
  tags?: string[]
  author: string
  at: string
  updatedAt: string
}

export type ImprovementScope = "design-system" | "lab"

export interface Improvement {
  id: string
  scope: ImprovementScope
  title: string
  body: string
  status: "open" | "planned" | "done" | "wontfix"
  images?: string[]
  hypothesis?: string
  author: string
  at: string
  updatedAt: string
}

export interface Iteration {
  id: string
  name: string
  goal: string
  start: string
  end: string
  status: "planned" | "active" | "done"
  /** Version the confirmed decisions roll into. */
  version?: string
  updatedAt?: string
}

export type Target =
  | {
      id: string
      kind: "route"
      name: string
      /** Path on the design origin (this build). */
      path: string
      /** Path on production, defaults to path. */
      prodPath?: string
      group?: string
    }
  | {
      id: string
      kind: "component"
      name: string
      /** Key in src/lab/registry/components.ts */
      component: string
      group?: string
    }
  | { id: string; kind: "image"; name: string; src: string; group?: string }

export interface FlowStep {
  target: string
  label: string
  /** What the person does to get to the next step. Drawn on the connector. */
  action?: string
}

export interface Flow {
  id: string
  name: string
  goal: string
  steps: FlowStep[]
}

export interface DesignToggleOption {
  value: string
  label: string
  /** Custom properties set on :root (light) */
  vars?: Record<string, string>
  /** Custom properties set on .dark */
  varsDark?: Record<string, string>
  /** Raw CSS injected into the frame */
  css?: string
}

/** Project-defined switches: candidate tokens, CSS variants, feature flags. */
export interface DesignToggle {
  id: string
  label: string
  description?: string
  hypothesis?: string
  options: DesignToggleOption[]
}

export interface Project {
  schema: 1
  id: string
  name: string
  description: string
  /** Deployed production origin, e.g. https://ericajaclyn.com */
  prodOrigin: string
  /** Same-origin proxy prefix for production (vercel.json rewrite), e.g. /_prod */
  prodProxy?: string
  targets: Target[]
  flows: Flow[]
  toggles: DesignToggle[]
  people: Person[]
  iterations: Iteration[]
  hypotheses: Hypothesis[]
  annotations: Annotation[]
  notes: Note[]
  improvements: Improvement[]
  comments: Comment[]
}

/** Collections that are merged entity-by-entity between repo and browser. */
export const COLLECTIONS = [
  "hypotheses",
  "annotations",
  "notes",
  "improvements",
  "comments",
  "people",
  "iterations",
] as const
export type Collection = (typeof COLLECTIONS)[number]
