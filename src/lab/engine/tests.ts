// Saved tests: versions, matching, changelogs and save-time capture.
// Pure functions over the data model, shared by the store and the UI.
//
// Changelog lines are written for an engineer or agent to act on: real ids,
// real values, one change per line, prefixed + (added), - (removed) or
// ~ (changed). Paths mirror the data: setup.switches.<id>, results.<check>@<frame>,
// <H-id>.decision.verdict, notes.<id>, improvements.<id>.status.

import type {
  CheckResult,
  Hypothesis,
  MatrixAxis,
  Project,
  SavedTest,
  TestContext,
  TestRef,
  TestSetup,
  TestVersion,
  ViewportSpec,
} from "../types"

const DEFAULT_VIEWPORT: ViewportSpec = { w: 1280, h: 800, zoom: 1 }

// ── Dates and versions ───────────────────────────────────────────────────

/** Local calendar date, YYYY-MM-DD. Never a time of day. */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Every save is a new major version: 1.0.0 → 2.0.0 → 3.0.0 */
export function nextVersion(test?: SavedTest): string {
  const last = test?.versions.at(-1)?.version
  const major = last ? Number(last.split(".")[0]) || 0 : 0
  return `${major + 1}.0.0`
}

export const vLabel = (version: string) => `v${version}`
export const refLabel = (ref: TestRef) => `${ref.test} ${vLabel(ref.version)}`

/** Sync key for the store's merge: ordered, but carries no time of day. */
export function syncKey(test: Pick<SavedTest, "versions">): string {
  const last = test.versions.at(-1)
  return `${last?.date ?? today()}#${String(test.versions.length).padStart(4, "0")}`
}

/** Next free T-nn id */
export function nextTestId(project: Project): string {
  const n = project.tests.reduce((max, t) => {
    const m = /^T-(\d+)$/.exec(t.id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `T-${String(n + 1).padStart(2, "0")}`
}

export function findTest(project: Project, id?: string): SavedTest | undefined {
  return id ? project.tests.find((t) => t.id === id) : undefined
}

export function findVersion(
  project: Project,
  ref?: TestRef
): TestVersion | undefined {
  return findTest(project, ref?.test)?.versions.find(
    (v) => v.version === ref?.version
  )
}

export function latestRef(test: SavedTest): TestRef {
  return { test: test.id, version: test.versions.at(-1)!.version }
}

// ── Setups ───────────────────────────────────────────────────────────────

/** Defaults filled in, empty fields dropped: the canonical form for comparing. */
export function normalizeSetup(
  s: Partial<TestSetup>,
  project: Project
): TestSetup {
  const out: TestSetup = {
    mode: s.mode ?? "review",
    target: s.target ?? project.targets[0]?.id,
    switches: Object.fromEntries(
      Object.entries(s.switches ?? {}).sort(([a], [b]) => a.localeCompare(b))
    ),
    viewport: s.viewport ?? DEFAULT_VIEWPORT,
  }
  if (s.flow) out.flow = s.flow
  if (s.props && Object.keys(s.props).length)
    out.props = Object.fromEntries(
      Object.entries(s.props).sort(([a], [b]) => a.localeCompare(b))
    )
  if (s.compare) out.compare = s.compare
  if (s.matrix?.length)
    out.matrix = s.matrix.map((a) => ({ ...a, values: [...a.values] }))
  return out
}

export function sameSetup(
  a: Partial<TestSetup>,
  b: Partial<TestSetup>,
  project: Project
): boolean {
  return (
    JSON.stringify(normalizeSetup(a, project)) ===
    JSON.stringify(normalizeSetup(b, project))
  )
}

/** The saved version exactly on screen, preferring `prefer` (the loaded test). */
export function matchingRef(
  project: Project,
  rig: TestSetup,
  prefer?: TestRef
): TestRef | undefined {
  const pv = findVersion(project, prefer)
  if (prefer && pv && sameSetup(pv.setup, rig, project)) return prefer
  for (const t of project.tests)
    for (let i = t.versions.length - 1; i >= 0; i--)
      if (sameSetup(t.versions[i].setup, rig, project))
        return { test: t.id, version: t.versions[i].version }
  return undefined
}

// ── Capture ──────────────────────────────────────────────────────────────

interface FrameLike {
  label: string
  analyses: Record<
    string,
    { switchId: string; summary: string; findings: { severity: string }[] }
  >
}

/** Check results from every live frame, sorted for stable diffs. */
export function captureResults(
  frames: Record<string, FrameLike>
): CheckResult[] {
  const out: CheckResult[] = []
  for (const f of Object.values(frames))
    for (const a of Object.values(f.analyses ?? {}))
      out.push({
        frame: f.label,
        check: a.switchId,
        fail: a.findings.filter((x) => x.severity === "fail").length,
        warn: a.findings.filter((x) => x.severity === "warn").length,
        summary: a.summary,
      })
  return out.sort(
    (a, b) => a.check.localeCompare(b.check) || a.frame.localeCompare(b.frame)
  )
}

/** The question's decision, notes and improvements as they stand now. */
export function captureContext(project: Project, h?: Hypothesis): TestContext {
  const linked = (x: { hypothesis?: string }) =>
    !x.hypothesis || x.hypothesis === h?.id
  return {
    hypothesis: h && {
      id: h.id,
      stage: h.stage,
      criteria: h.successCriteria.map((text, i) => ({
        text,
        result: h.criteriaResults?.[i] ?? "untested",
      })),
      decision: h.decision && {
        verdict: h.decision.verdict,
        answer: h.decision.answer,
        author: h.decision.author,
      },
    },
    notes: project.notes
      .filter(linked)
      .map((n) => ({ id: n.id, title: n.title, body: n.body })),
    improvements: project.improvements.filter(linked).map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      scope: i.scope,
    })),
  }
}

// ── Changelog ────────────────────────────────────────────────────────────

const vp = (v?: ViewportSpec) =>
  v ? `${v.w}x${v.h}${v.zoom !== 1 ? `@${v.zoom}` : ""}` : "—"
const axes = (m?: MatrixAxis[]) =>
  m?.length
    ? m.map((a) => `${a.kind}:${a.key}:${a.values.join("/")}`).join(" × ")
    : "—"
const val = (v: unknown) =>
  v === undefined || v === null || v === "" ? "—" : String(v)
const quote = (s: string) =>
  JSON.stringify(s.length > 80 ? `${s.slice(0, 77)}…` : s)

function diffMap(
  path: string,
  a: Record<string, string> = {},
  b: Record<string, string> = {}
): string[] {
  const out: string[] = []
  for (const k of Object.keys(b).sort())
    if (!(k in a)) out.push(`+ ${path}.${k} = ${b[k]}`)
    else if (a[k] !== b[k]) out.push(`~ ${path}.${k}: ${a[k]} → ${b[k]}`)
  for (const k of Object.keys(a).sort())
    if (!(k in b)) out.push(`- ${path}.${k} (was ${a[k]})`)
  return out
}

function setupLines(a: TestSetup, b: TestSetup): string[] {
  const out: string[] = []
  const field = (name: string, x: string, y: string) => {
    if (x !== y) out.push(`~ setup.${name}: ${x} → ${y}`)
  }
  field("mode", val(a.mode), val(b.mode))
  field("target", val(a.target), val(b.target))
  field("flow", val(a.flow), val(b.flow))
  field("viewport", vp(a.viewport), vp(b.viewport))
  field("compare", val(a.compare), val(b.compare))
  field("matrix", axes(a.matrix), axes(b.matrix))
  out.push(...diffMap("setup.props", a.props, b.props))
  out.push(...diffMap("setup.switches", a.switches, b.switches))
  return out
}

function resultLines(a: CheckResult[], b: CheckResult[]): string[] {
  const key = (r: CheckResult) => `${r.check}@${r.frame}`
  const am = new Map(a.map((r) => [key(r), r]))
  const bm = new Map(b.map((r) => [key(r), r]))
  const out: string[] = []
  for (const [k, r] of bm) {
    const p = am.get(k)
    if (!p) out.push(`+ results.${k}: fail ${r.fail}, warn ${r.warn}`)
    else if (p.fail !== r.fail || p.warn !== r.warn)
      out.push(
        `~ results.${k}: fail ${p.fail} → ${r.fail}, warn ${p.warn} → ${r.warn}`
      )
  }
  for (const [k, r] of am)
    if (!bm.has(k))
      out.push(`- results.${k} (was fail ${r.fail}, warn ${r.warn})`)
  return out
}

function contextLines(a: TestContext, b: TestContext): string[] {
  const out: string[] = []
  const ha = a.hypothesis
  const hb = b.hypothesis
  if (hb) {
    const id = hb.id
    if (ha?.id !== hb.id) out.push(`~ hypothesis: ${val(ha?.id)} → ${id}`)
    if (ha?.stage !== hb.stage)
      out.push(`~ ${id}.stage: ${val(ha?.stage)} → ${hb.stage}`)
    if (ha?.decision?.verdict !== hb.decision?.verdict)
      out.push(
        `~ ${id}.decision.verdict: ${val(ha?.decision?.verdict)} → ${val(hb.decision?.verdict)}`
      )
    else if (hb.decision && ha?.decision?.answer !== hb.decision.answer)
      out.push(`~ ${id}.decision.answer: ${quote(hb.decision.answer)}`)
    hb.criteria.forEach((c, i) => {
      const p = ha?.criteria[i]
      if (!p) out.push(`+ ${id}.criteria[${i}] = ${c.result}: ${quote(c.text)}`)
      else if (p.result !== c.result)
        out.push(`~ ${id}.criteria[${i}]: ${p.result} → ${c.result}`)
      else if (p.text !== c.text)
        out.push(`~ ${id}.criteria[${i}].text: ${quote(c.text)}`)
    })
    for (let i = hb.criteria.length; i < (ha?.criteria.length ?? 0); i++)
      out.push(`- ${id}.criteria[${i}] (was ${quote(ha!.criteria[i].text)})`)
  }
  const byId = <T extends { id: string }>(l: T[]) =>
    new Map(l.map((x) => [x.id, x]))
  const na = byId(a.notes)
  const nb = byId(b.notes)
  for (const [id, n] of nb)
    if (!na.has(id)) out.push(`+ notes.${id} ${quote(n.title)}`)
    else if (na.get(id)!.title !== n.title || na.get(id)!.body !== n.body)
      out.push(`~ notes.${id} ${quote(n.title)}`)
  for (const [id, n] of na)
    if (!nb.has(id)) out.push(`- notes.${id} ${quote(n.title)}`)
  const ia = byId(a.improvements)
  const ib = byId(b.improvements)
  for (const [id, x] of ib) {
    const p = ia.get(id)
    if (!p) out.push(`+ improvements.${id} = ${x.status}: ${quote(x.title)}`)
    else if (p.status !== x.status)
      out.push(`~ improvements.${id}.status: ${p.status} → ${x.status}`)
  }
  for (const [id, x] of ia)
    if (!ib.has(id)) out.push(`- improvements.${id} ${quote(x.title)}`)
  return out
}

/** Changelog for a new version against the one before it (or "initial"). */
export function changelog(
  prev: TestVersion | undefined,
  next: Pick<TestVersion, "setup" | "results" | "context">,
  project: Project
): string[] {
  const b = normalizeSetup(next.setup, project)
  if (!prev) {
    const lines = [
      `+ setup.mode = ${b.mode}`,
      `+ setup.target = ${val(b.target)}`,
      `+ setup.viewport = ${vp(b.viewport)}`,
    ]
    if (b.flow) lines.push(`+ setup.flow = ${b.flow}`)
    if (b.compare) lines.push(`+ setup.compare = ${b.compare}`)
    if (b.matrix) lines.push(`+ setup.matrix = ${axes(b.matrix)}`)
    lines.push(...diffMap("setup.props", {}, b.props))
    lines.push(...diffMap("setup.switches", {}, b.switches))
    lines.push(...resultLines([], next.results))
    return lines
  }
  return [
    ...setupLines(normalizeSetup(prev.setup, project), b),
    ...resultLines(prev.results, next.results),
    ...contextLines(prev.context, next.context),
  ]
}
