// Local-first store. The project file from the repo is the base; everything
// you add in the browser is an overlay keyed by entity id, merged by
// updatedAt, persisted to localStorage and handed back to Claude as a file.

import { useSyncExternalStore } from "react"
import { decodeLink, encodeLink } from "../engine/url"
import {
  captureContext,
  changelog,
  findTest,
  findVersion,
  matchingRef,
  nextTestId,
  nextVersion,
  normalizeSetup,
  syncKey,
  today,
} from "../engine/tests"
import {
  COLLECTIONS,
  type AnnotationCategory,
  type Collection,
  type Comment,
  type Hypothesis,
  type Mode,
  type CheckResult,
  type Person,
  type Project,
  type SavedTest,
  type Stage,
  type SwitchState,
  type TestRef,
  type TestSetup,
  type TestVersion,
  type ViewportSpec,
} from "../types"

// ── Projects in the repo ─────────────────────────────────────────────────

const files = import.meta.glob<{ default: Project }>("../projects/*.json", {
  eager: true,
})
export const BASE_PROJECTS: Project[] = Object.values(files)
  .map((m) => ({ ...m.default, tests: m.default.tests ?? [] }))
  .sort((a, b) => a.name.localeCompare(b.name))

type Entity = { id: string; updatedAt?: string; [k: string]: unknown }
type OverlayEntity = Entity & { _dirty?: boolean }

export interface Overlay {
  entities: Partial<Record<Collection, Record<string, OverlayEntity>>>
  deleted: Record<string, { at: string; dirty?: boolean }>
  lastHandoff?: string
}

export type Tool =
  | "interact"
  | "inspect"
  | "pin"
  | "box"
  | "arrow"
  | "label"
  | "measure"
export type RightTab = "decide" | "notes" | "system"

export interface UIState {
  projectId: string
  hypothesisId?: string
  rig: TestSetup
  tool: Tool
  category: AnnotationCategory
  leftOpen: boolean
  rightOpen: boolean
  rightTab: RightTab
  showAnnotations: boolean
  showFindings: boolean
  findingsOpen: boolean
  blind: boolean
  identity: string
  selectedAnnotation?: string
  /** The saved test version last loaded into the rig (question pin or Saved menu) */
  loadedTest?: TestRef
  /** Bumped to force frames to reload */
  reloadKey: number
}

export interface LabState {
  ui: UIState
  overlay: Overlay
  project: Project
}

export const DEFAULT_VIEWPORT: ViewportSpec = { w: 1280, h: 800, zoom: 1 }

const now = () => new Date().toISOString()
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`

// ── Persistence ──────────────────────────────────────────────────────────

const KEY = (p: string) => `lab:v1:${p}:overlay`
const UI_KEY = "lab:v1:ui"
const ID_KEY = (p: string) => `lab:v1:${p}:identity`

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or quota: state still works for this session */
  }
}

// ── Merge ────────────────────────────────────────────────────────────────

export function merge(base: Project, ov: Overlay): Project {
  const out: Project = { ...base }
  for (const c of COLLECTIONS) {
    const map = new Map<string, Entity>(
      (base[c] as unknown as Entity[]).map((e) => [e.id, e])
    )
    for (const e of Object.values(ov.entities[c] ?? {})) {
      const b = map.get(e.id)
      if (!b || (e.updatedAt ?? "") >= (b.updatedAt ?? "")) {
        const { _dirty, ...clean } = e
        void _dirty
        map.set(e.id, clean)
      }
    }
    for (const [id, d] of Object.entries(ov.deleted)) {
      const b = map.get(id)
      if (b && (b.updatedAt ?? "") <= d.at) map.delete(id)
    }
    ;(out as unknown as Record<string, Entity[]>)[c] = [...map.values()]
  }
  return out
}

/** Drop overlay entries the repo has caught up with (Claude merged them). */
function prune(base: Project, ov: Overlay): Overlay {
  const entities: Overlay["entities"] = {}
  for (const c of COLLECTIONS) {
    const baseMap = new Map(
      (base[c] as unknown as Entity[]).map((e) => [e.id, e])
    )
    const kept: Record<string, OverlayEntity> = {}
    for (const [id, e] of Object.entries(ov.entities[c] ?? {})) {
      const b = baseMap.get(id)
      if (!e._dirty && b && (b.updatedAt ?? "") >= (e.updatedAt ?? "")) continue
      kept[id] = e
    }
    entities[c] = kept
  }
  return { ...ov, entities }
}

// ── Store ────────────────────────────────────────────────────────────────

type Listener = () => void

class LabStore {
  state: LabState
  private listeners = new Set<Listener>()

  constructor() {
    const link =
      typeof location !== "undefined"
        ? decodeLink(location.search)
        : { setup: {} as Partial<TestSetup> }
    const projectId =
      (link.project && BASE_PROJECTS.find((p) => p.id === link.project)?.id) ??
      BASE_PROJECTS[0]?.id ??
      ""
    const base = this.base(projectId)
    const overlay = prune(
      base,
      read<Overlay>(KEY(projectId), { entities: {}, deleted: {} })
    )
    const saved = read<Partial<UIState>>(UI_KEY, {})
    const project = merge(base, overlay)
    const owner = project.people.find((p) => p.role === "owner")?.id ?? "owner"
    const ui: UIState = {
      projectId,
      rig: {
        mode: "review",
        switches: {},
        viewport: DEFAULT_VIEWPORT,
        target: project.targets[0]?.id,
      },
      tool: "interact",
      category: "issue",
      leftOpen: saved.leftOpen ?? true,
      rightOpen: saved.rightOpen ?? true,
      rightTab: saved.rightTab ?? "decide",
      showAnnotations: true,
      showFindings: true,
      findingsOpen: saved.findingsOpen ?? true,
      blind: saved.blind ?? false,
      identity: read<string>(ID_KEY(projectId), owner),
      reloadKey: 0,
    }
    this.state = { ui, overlay, project }

    if (link.invite) this.acceptInvite(link.invite)
    const h =
      link.hypothesis &&
      project.hypotheses.find((x) => x.id === link.hypothesis)
    if (h)
      this.state.ui = {
        ...this.state.ui,
        hypothesisId: h.id,
        rig: presetOf(h, project),
        loadedTest: h.testRef,
      }
    else if (!Object.keys(link.setup).length) {
      const first =
        project.hypotheses.find((x) => x.stage === "testing") ??
        project.hypotheses[0]
      if (first)
        this.state.ui = {
          ...this.state.ui,
          hypothesisId: first.id,
          rig: presetOf(first, project),
          loadedTest: first.testRef,
        }
    }
    // Anything explicit in the URL wins over the preset: that's how a modified link reproduces a deviation
    if (Object.keys(link.setup).length)
      this.state.ui.rig = { ...this.state.ui.rig, ...link.setup }
    this.syncUrl()
  }

  private base(projectId: string): Project {
    return BASE_PROJECTS.find((p) => p.id === projectId) ?? BASE_PROJECTS[0]
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getState = () => this.state

  private emit() {
    for (const l of this.listeners) l()
  }

  setUI(patch: Partial<UIState>) {
    this.state = { ...this.state, ui: { ...this.state.ui, ...patch } }
    const { leftOpen, rightOpen, rightTab, blind, findingsOpen } = this.state.ui
    write(UI_KEY, { leftOpen, rightOpen, rightTab, blind, findingsOpen })
    if ("rig" in patch || "hypothesisId" in patch) this.syncUrl()
    this.emit()
  }

  setRig(patch: Partial<TestSetup>) {
    this.setUI({ rig: { ...this.state.ui.rig, ...patch } })
  }

  setMode(mode: Mode) {
    this.setRig({ mode })
  }

  setSwitch(id: string, value: string | null) {
    const switches: SwitchState = { ...this.state.ui.rig.switches }
    if (value === null) delete switches[id]
    else switches[id] = value
    this.setRig({ switches })
  }

  selectHypothesis(id: string | undefined, loadPreset = true) {
    const h = id
      ? this.state.project.hypotheses.find((x) => x.id === id)
      : undefined
    this.setUI({
      hypothesisId: id,
      ...(h && loadPreset
        ? { rig: presetOf(h, this.state.project), loadedTest: h.testRef }
        : {}),
      rightTab: "decide",
      rightOpen: true,
    })
  }

  resetToPreset() {
    const h = this.hypothesis()
    if (h)
      this.setUI({
        rig: presetOf(h, this.state.project),
        loadedTest: h.testRef,
      })
  }

  // ── Saved tests ────────────────────────────────────────────────────────

  /** What's on screen, for decisions and evidence: the rig plus the saved test version it matches. */
  provenance(): { snapshot: TestSetup; testRef?: TestRef } {
    const rig = this.state.ui.rig
    const ref = matchingRef(this.state.project, rig, this.state.ui.loadedTest)
    return {
      snapshot: { ...rig, switches: { ...rig.switches } },
      ...(ref ? { testRef: ref } : {}),
    }
  }

  /** Put a saved test version on screen. */
  loadTest(ref: TestRef) {
    const v = findVersion(this.state.project, ref)
    if (!v) return
    this.setUI({
      rig: normalizeSetup(v.setup, this.state.project),
      loadedTest: ref,
    })
  }

  /**
   * Save what's on screen as a version: v1.0.0 of a new test, or the next
   * major version of an existing one. Never overwrites an earlier version.
   */
  saveTest(opts: {
    /** Existing test to add a version to; omit to create a new test */
    testId?: string
    /** Name for a new test */
    name?: string
    /** Why it changed. Required unless this is v1.0.0. */
    message?: string
    results: CheckResult[]
    /** Point the current question at the new version */
    pin: boolean
  }): TestRef {
    const project = this.state.project
    const h = this.hypothesis()
    const existing = findTest(project, opts.testId)
    const version = nextVersion(existing)
    const message = opts.message?.trim()
    if (existing && !message)
      throw new Error("A new version needs a description of what changed")
    const setup = normalizeSetup(this.state.ui.rig, project)
    const context = captureContext(project, h)
    const entry: TestVersion = {
      version,
      setup,
      ...(message ? { message } : {}),
      changelog: changelog(
        existing?.versions.at(-1),
        { setup, results: opts.results, context },
        project
      ),
      results: opts.results,
      context,
      author: this.state.ui.identity,
      date: today(),
      iteration:
        h?.iteration ??
        project.iterations.find((i) => i.status === "active")?.id,
      ...(h ? { hypothesis: h.id } : {}),
    }
    const versions = [...(existing?.versions ?? []), entry]
    const test: SavedTest = {
      id: existing?.id ?? nextTestId(project),
      name: existing?.name ?? (opts.name?.trim() || "Untitled test"),
      versions,
      createdBy: existing?.createdBy ?? this.state.ui.identity,
      updatedAt: syncKey({ versions }),
    }
    // touch: false keeps the date-only sync key instead of a timestamp
    this.upsert("tests", test, { touch: false })
    const ref: TestRef = { test: test.id, version }
    if (opts.pin && h)
      this.updateHypothesis(h.id, { testRef: ref, test: undefined })
    this.setUI({ loadedTest: ref })
    return ref
  }

  hypothesis(): Hypothesis | undefined {
    return this.state.project.hypotheses.find(
      (x) => x.id === this.state.ui.hypothesisId
    )
  }

  me(): Person {
    return (
      this.state.project.people.find(
        (p) => p.id === this.state.ui.identity
      ) ?? {
        id: this.state.ui.identity,
        name: this.state.ui.identity,
        role: "owner",
      }
    )
  }

  setIdentity(id: string) {
    write(ID_KEY(this.state.ui.projectId), id)
    this.setUI({ identity: id })
  }

  switchProject(id: string) {
    const url = new URL(location.href)
    url.search = `?p=${encodeURIComponent(id)}`
    location.assign(url.toString())
  }

  reloadFrames() {
    this.setUI({ reloadKey: this.state.ui.reloadKey + 1 })
  }

  // ── Entity mutations ───────────────────────────────────────────────────

  upsert<C extends Collection>(
    c: C,
    entity: Project[C][number],
    opts: { dirty?: boolean; touch?: boolean } = {}
  ) {
    const e = entity as unknown as OverlayEntity
    const stamped: OverlayEntity = {
      ...e,
      updatedAt: opts.touch === false ? e.updatedAt : now(),
      _dirty: opts.dirty ?? true,
    }
    const ov = this.state.overlay
    const overlay: Overlay = {
      ...ov,
      entities: {
        ...ov.entities,
        [c]: { ...(ov.entities[c] ?? {}), [e.id]: stamped },
      },
    }
    if (overlay.deleted[e.id]) {
      const { [e.id]: _gone, ...rest } = overlay.deleted
      void _gone
      overlay.deleted = rest
    }
    this.commit(overlay)
  }

  remove(c: Collection, id: string) {
    const ov = this.state.overlay
    const ents = { ...(ov.entities[c] ?? {}) }
    delete ents[id]
    this.commit({
      ...ov,
      entities: { ...ov.entities, [c]: ents },
      deleted: { ...ov.deleted, [id]: { at: now(), dirty: true } },
    })
  }

  private commit(overlay: Overlay) {
    const base = this.base(this.state.ui.projectId)
    write(KEY(this.state.ui.projectId), overlay)
    this.state = { ...this.state, overlay, project: merge(base, overlay) }
    this.emit()
  }

  dirtyCount(): number {
    let n = Object.values(this.state.overlay.deleted).filter(
      (d) => d.dirty
    ).length
    for (const c of COLLECTIONS)
      n += Object.values(this.state.overlay.entities[c] ?? {}).filter(
        (e) => e._dirty
      ).length
    return n
  }

  /** After a handoff: entities stay in the overlay until the repo catches up, but are no longer "unsent". */
  markHandedOff() {
    const ov = this.state.overlay
    const entities: Overlay["entities"] = {}
    for (const c of COLLECTIONS) {
      entities[c] = Object.fromEntries(
        Object.entries(ov.entities[c] ?? {}).map(([id, e]) => [
          id,
          { ...e, _dirty: false },
        ])
      )
    }
    const deleted = Object.fromEntries(
      Object.entries(ov.deleted).map(([id, d]) => [id, { ...d, dirty: false }])
    )
    this.commit({ entities, deleted, lastHandoff: now() })
  }

  dirtyEntities(all = false): {
    entities: Partial<Record<Collection, Entity[]>>
    deleted: Record<string, string>
  } {
    const ov = this.state.overlay
    const entities: Partial<Record<Collection, Entity[]>> = {}
    for (const c of COLLECTIONS) {
      const list = Object.values(ov.entities[c] ?? {})
        .filter((e) => all || e._dirty)
        .map(({ _dirty, ...e }) => (void _dirty, e))
      if (list.length) entities[c] = list
    }
    const deleted = Object.fromEntries(
      Object.entries(ov.deleted)
        .filter(([, d]) => all || d.dirty)
        .map(([id, d]) => [id, d.at])
    )
    return { entities, deleted }
  }

  /** Clear everything local for this project. The repo file is untouched. */
  discardLocal() {
    this.commit({ entities: {}, deleted: {} })
  }

  // ── Domain helpers ─────────────────────────────────────────────────────

  updateHypothesis(id: string, patch: Partial<Hypothesis>) {
    const h = this.state.project.hypotheses.find((x) => x.id === id)
    if (h) this.upsert("hypotheses", { ...h, ...patch })
  }

  setStage(id: string, stage: Stage) {
    const h = this.state.project.hypotheses.find((x) => x.id === id)
    if (!h || h.stage === stage) return
    this.upsert("hypotheses", {
      ...h,
      stage,
      stageHistory: [
        ...(h.stageHistory ?? []),
        { stage, at: now(), by: this.state.ui.identity },
      ],
    })
  }

  comment(thread: string, body: string, needsClaude: boolean) {
    const c: Comment = {
      id: uid("C"),
      thread,
      author: this.state.ui.identity,
      body,
      needsClaude,
      at: now(),
      updatedAt: now(),
    }
    this.upsert("comments", c)
  }

  createHypothesis(partial: Partial<Hypothesis>): string {
    const id = uid("H")
    const rig = this.state.ui.rig
    const h: Hypothesis = {
      id,
      title: partial.title ?? "Untitled hypothesis",
      statement: partial.statement ?? "",
      successCriteria: partial.successCriteria ?? [],
      stage: "idea",
      iteration: this.state.project.iterations.find(
        (i) => i.status === "active"
      )?.id,
      test: partial.test ?? { ...rig, switches: { ...rig.switches } },
      evidence: [],
      stageHistory: [{ stage: "idea", at: now(), by: this.state.ui.identity }],
      createdBy: this.state.ui.identity,
      createdAt: now(),
      updatedAt: now(),
      ...partial,
    }
    this.upsert("hypotheses", h)
    return id
  }

  /** Contributors open `/aidesignlab?p=…&invite=<base64url JSON>`; the person travels in the link. */
  acceptInvite(code: string) {
    try {
      const json = JSON.parse(atob(code.replace(/-/g, "+").replace(/_/g, "/")))
      if (!json.id || !json.name || !json.token) return
      const person: Person = {
        id: json.id,
        name: String(json.name).slice(0, 60),
        role: "contributor",
        invite: {
          token: json.token,
          createdAt: json.createdAt ?? now(),
          acceptedAt: now(),
        },
      }
      this.upsert("people", person)
      write(ID_KEY(this.state.ui.projectId), person.id)
      this.state.ui = { ...this.state.ui, identity: person.id }
      const url = new URL(location.href)
      url.searchParams.delete("invite")
      history.replaceState(null, "", url.toString())
    } catch {
      /* malformed invite: ignore */
    }
  }

  inviteLink(name: string): { link: string; person: Person } {
    const person: Person = {
      id: uid("P"),
      name,
      role: "contributor",
      invite: {
        token: Math.random().toString(36).slice(2, 12),
        createdAt: now(),
      },
    }
    this.upsert("people", person)
    const code = btoa(
      JSON.stringify({
        id: person.id,
        name,
        token: person.invite!.token,
        createdAt: person.invite!.createdAt,
      })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    const url = new URL(location.origin + location.pathname)
    url.search = `?p=${this.state.ui.projectId}&invite=${code}`
    return { link: url.toString(), person }
  }

  testLink(h?: Hypothesis, setup?: TestSetup): string {
    const path = `${location.origin}${location.pathname}`
    return (
      path +
      encodeLink({
        project: this.state.ui.projectId,
        hypothesis: h?.id ?? this.state.ui.hypothesisId,
        setup: setup ?? this.state.ui.rig,
      })
    )
  }

  private syncUrl() {
    if (typeof history === "undefined") return
    const { projectId, hypothesisId, rig } = this.state.ui
    const q = encodeLink({
      project: projectId,
      hypothesis: hypothesisId,
      setup: rig,
    })
    history.replaceState(null, "", `${location.pathname}${q}`)
  }
}

/**
 * A hypothesis's test setup with defaults filled in: its pinned saved test
 * version if it has one, otherwise its inline (unsaved) setup.
 */
export function presetOf(h: Hypothesis, project: Project): TestSetup {
  const t: Partial<TestSetup> =
    findVersion(project, h.testRef)?.setup ?? h.test ?? {}
  return {
    mode: t.mode ?? "review",
    target: t.target ?? project.targets[0]?.id,
    flow: t.flow,
    props: t.props ? { ...t.props } : undefined,
    switches: { ...(t.switches ?? {}) },
    viewport: t.viewport ?? DEFAULT_VIEWPORT,
    compare: t.compare,
    matrix: t.matrix?.map((a) => ({ ...a, values: [...a.values] })),
  }
}

export const store = new LabStore()

export function useLab<T>(selector: (s: LabState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  )
}

export function personName(project: Project, id: string): string {
  return project.people.find((p) => p.id === id)?.name ?? id
}
