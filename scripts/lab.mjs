#!/usr/bin/env node
// Design Lab CLI — the repo side of the review loop.
//
//   node scripts/lab.mjs links  [--project portfolio] [--base https://<preview>.vercel.app]
//   node scripts/lab.mjs check  [--project portfolio]
//   node scripts/lab.mjs merge  <handoff.json>
//   node scripts/lab.mjs digest [--project portfolio] [--base …]
//
// Requires Node ≥ 22.18 (imports the lab's TypeScript URL encoder directly,
// so links here are byte-identical to the ones the app makes).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
// LAB_PROJECTS_DIR lets tests merge into a scratch copy
const PROJECTS = process.env.LAB_PROJECTS_DIR ?? join(ROOT, "src/lab/projects")
const COLLECTIONS = [
  "hypotheses",
  "annotations",
  "notes",
  "improvements",
  "comments",
  "people",
  "iterations",
  "tests",
]
const STAGES = [
  "idea",
  "tentative",
  "testing",
  "validated",
  "verified",
  "confirmed",
  "rejected",
  "parked",
]

let encodeLink
try {
  ;({ encodeLink } = await import("../src/lab/engine/url.ts"))
} catch (e) {
  console.error(
    `Couldn't load src/lab/engine/url.ts (${e.message}). Use Node ≥ 22.18, or run with --experimental-strip-types.`
  )
  process.exit(2)
}

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

function projectIds() {
  return readdirSync(PROJECTS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
}
function load(id) {
  return JSON.parse(readFileSync(join(PROJECTS, `${id}.json`), "utf8"))
}
function save(project) {
  writeFileSync(
    join(PROJECTS, `${project.id}.json`),
    `${JSON.stringify(project, null, 2)}\n`
  )
}
const projectArg = () => opt("project", projectIds()[0])
const base = () =>
  (opt("base", "http://localhost:4321") + "/aidesignlab").replace(
    /\/+aidesignlab$/,
    "/aidesignlab"
  )

// A question runs its pinned saved test version; unsaved ones keep `test`
function pinnedSetup(h, project) {
  if (!h.testRef) return undefined
  return (project.tests ?? [])
    .find((t) => t.id === h.testRef.test)
    ?.versions.find((v) => v.version === h.testRef.version)?.setup
}

function preset(h, project) {
  const t = pinnedSetup(h, project) ?? h.test ?? {}
  return {
    mode: t.mode ?? "review",
    target: t.target ?? project.targets[0]?.id,
    flow: t.flow,
    props: t.props,
    switches: t.switches ?? {},
    viewport: t.viewport ?? { w: 1280, h: 800, zoom: 1 },
    compare: t.compare,
    matrix: t.matrix,
  }
}
const link = (h, project) =>
  base() +
  encodeLink({
    project: project.id,
    hypothesis: h.id,
    setup: preset(h, project),
  })

// ── links ────────────────────────────────────────────────────────────────
function links() {
  const project = load(projectArg())
  const order = [
    "testing",
    "tentative",
    "idea",
    "validated",
    "verified",
    "confirmed",
    "parked",
    "rejected",
  ]
  for (const stage of order) {
    const list = project.hypotheses.filter((h) => h.stage === stage)
    if (!list.length) continue
    console.log(`\n## ${stage}`)
    for (const h of list)
      console.log(`${h.id}  ${h.title}\n    ${link(h, project)}`)
  }
}

// ── check ────────────────────────────────────────────────────────────────
function check(id = projectArg(), quiet = false) {
  const project = load(id)
  const errors = []
  const warn = []
  const catalog = JSON.parse(
    readFileSync(join(ROOT, "src/lab/registry/switches.json"), "utf8")
  )
  const switchIds = new Set([
    ...catalog.switches.map((s) => s.id),
    ...project.toggles.map((t) => `dt.${t.id}`),
  ])
  const switchOptions = new Map([
    ...catalog.switches.map((s) => [s.id, s.options?.map((o) => o.value)]),
    ...project.toggles.map((t) => [
      `dt.${t.id}`,
      t.options.map((o) => o.value),
    ]),
  ])
  const targets = new Set(project.targets.map((t) => t.id))
  const flows = new Set(project.flows.map((f) => f.id))
  const iterations = new Set(project.iterations.map((i) => i.id))
  const people = new Set(project.people.map((p) => p.id))
  const ids = new Map()
  for (const c of COLLECTIONS) {
    for (const e of project[c] ?? []) {
      if (ids.has(e.id))
        errors.push(`Duplicate id ${e.id} in ${c} and ${ids.get(e.id)}`)
      ids.set(e.id, c)
    }
  }
  const meta = readFileSync(
    join(ROOT, "src/lab/registry/components.meta.ts"),
    "utf8"
  )
  for (const t of project.targets) {
    if (t.kind === "component" && !meta.includes(`id: "${t.component}"`))
      errors.push(
        `Target ${t.id}: component "${t.component}" is not in components.meta.ts`
      )
  }
  for (const f of project.flows)
    for (const s of f.steps)
      if (!targets.has(s.target))
        errors.push(`Flow ${f.id}: unknown target ${s.target}`)
  for (const h of project.hypotheses) {
    const where = `Hypothesis ${h.id}`
    if (!STAGES.includes(h.stage))
      errors.push(`${where}: unknown stage ${h.stage}`)
    if (h.iteration && !iterations.has(h.iteration))
      errors.push(`${where}: unknown iteration ${h.iteration}`)
    if (!h.statement) warn.push(`${where}: no statement`)
    if (!h.successCriteria?.length)
      warn.push(`${where}: no success criteria — not falsifiable yet`)
    if (h.testRef && !pinnedSetup(h, project))
      errors.push(
        `${where}: pinned to ${h.testRef.test} v${h.testRef.version}, which doesn't exist`
      )
    const t = pinnedSetup(h, project) ?? h.test ?? {}
    if (t.target && !targets.has(t.target))
      errors.push(`${where}: unknown target ${t.target}`)
    if (t.flow && !flows.has(t.flow))
      errors.push(`${where}: unknown flow ${t.flow}`)
    for (const [k, v] of Object.entries(t.switches ?? {})) {
      if (!switchIds.has(k)) errors.push(`${where}: unknown switch ${k}`)
      const opts = switchOptions.get(k)
      if (opts && !opts.includes(v))
        errors.push(
          `${where}: switch ${k} has no option "${v}" (${opts.join(", ")})`
        )
    }
    for (const a of t.matrix ?? []) {
      if (a.kind === "switch" && !switchIds.has(a.key))
        errors.push(`${where}: matrix axis uses unknown switch ${a.key}`)
      if (a.kind === "target")
        for (const v of a.values)
          if (!targets.has(v))
            errors.push(`${where}: matrix axis uses unknown target ${v}`)
    }
    if (
      t.mode === "compare" &&
      project.targets.find((x) => x.id === t.target)?.kind !== "route"
    )
      errors.push(`${where}: compare needs a route target`)
  }
  // Saved tests: append-only versions, semver majors, date-only, messages from v2
  for (const t of project.tests ?? []) {
    const where = `Test ${t.id}`
    if (!/^T-\d+$/.test(t.id)) warn.push(`${where}: id should look like T-01`)
    if (!t.versions?.length) errors.push(`${where}: has no versions`)
    ;(t.versions ?? []).forEach((v, i) => {
      const at = `${where} v${v.version}`
      if (v.version !== `${i + 1}.0.0`)
        errors.push(`${at}: expected v${i + 1}.0.0 at position ${i + 1}`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date ?? ""))
        errors.push(`${at}: date must be YYYY-MM-DD (no time of day)`)
      if (i > 0 && !v.message?.trim())
        errors.push(`${at}: versions after v1.0.0 need a message`)
      if (v.setup?.target && !targets.has(v.setup.target))
        errors.push(`${at}: unknown target ${v.setup.target}`)
      for (const k of Object.keys(v.setup?.switches ?? {}))
        if (!switchIds.has(k)) errors.push(`${at}: unknown switch ${k}`)
      if (v.author && !people.has(v.author))
        warn.push(`${at}: author ${v.author} isn't in people`)
    })
  }
  for (const c of project.comments) {
    if (!ids.has(c.thread))
      warn.push(`Comment ${c.id}: thread ${c.thread} not found`)
    if (!people.has(c.author))
      warn.push(`Comment ${c.id}: author ${c.author} isn't in people`)
  }
  for (const a of project.annotations)
    if (!targets.has(a.target) && !a.target.startsWith("note:"))
      warn.push(`Annotation ${a.id}: unknown target ${a.target}`)
  if (!quiet || errors.length) {
    for (const e of errors) console.log(`✗ ${e}`)
    for (const w of warn) console.log(`! ${w}`)
    console.log(
      errors.length
        ? `\n${errors.length} error(s)`
        : `✓ ${project.id}: ${project.hypotheses.length} hypotheses, ${(project.tests ?? []).length} saved tests, ${project.targets.length} targets, ${switchIds.size} switches — valid${warn.length ? ` (${warn.length} warnings)` : ""}`
    )
  }
  return errors.length === 0
}

// ── merge ────────────────────────────────────────────────────────────────
function merge(file) {
  if (!file) {
    console.error("Usage: node scripts/lab.mjs merge <handoff.json>")
    process.exit(2)
  }
  const handoff = JSON.parse(readFileSync(file, "utf8"))
  if (handoff.kind !== "design-lab-handoff")
    throw new Error("Not a Design Lab handoff file")
  const project = load(handoff.project)

  // Screenshots: idb:<id> data URLs → src/lab/projects/<project>/assets/<id>.<ext>, refs → asset:<file>
  const refMap = new Map()
  for (const [ref, data] of Object.entries(handoff.images ?? {})) {
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(data)
    if (!m) continue
    const dir = join(PROJECTS, project.id, "assets")
    mkdirSync(dir, { recursive: true })
    const name = `${ref.replace(/^idb:/, "")}.${m[1].replace("jpeg", "jpg")}`
    writeFileSync(join(dir, name), Buffer.from(m[2], "base64"))
    refMap.set(ref, `asset:${name}`)
  }
  const rewrite = (v) => {
    if (typeof v === "string") return refMap.get(v) ?? v
    if (Array.isArray(v)) return v.map(rewrite)
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, rewrite(x)])
      )
    return v
  }

  const counts = {}
  for (const c of COLLECTIONS) {
    const incoming = handoff.entities?.[c] ?? []
    if (!incoming.length) continue
    const map = new Map((project[c] ?? []).map((e) => [e.id, e]))
    let n = 0
    for (const e of incoming) {
      const cur = map.get(e.id)
      if (!cur || (e.updatedAt ?? "") >= (cur.updatedAt ?? "")) {
        map.set(e.id, rewrite(e))
        n++
      }
    }
    project[c] = [...map.values()]
    counts[c] = n
  }
  let removed = 0
  for (const [id, at] of Object.entries(handoff.deleted ?? {})) {
    for (const c of COLLECTIONS) {
      const before = project[c].length
      project[c] = project[c].filter(
        (e) => !(e.id === id && (e.updatedAt ?? "") <= at)
      )
      removed += before - project[c].length
    }
  }
  save(project)
  console.log(
    `Merged handoff from ${handoff.from?.name ?? "?"} (${handoff.exportedAt}): ${
      Object.entries(counts)
        .map(([c, n]) => `${n} ${c}`)
        .join(", ") || "nothing new"
    }, ${removed} removed, ${refMap.size} images.`
  )
  const needs = (handoff.entities?.comments ?? []).filter((c) => c.needsClaude)
  if (needs.length) {
    console.log(`\nNeeds Claude (${needs.length}):`)
    for (const c of needs) console.log(`- [${c.thread}] ${c.body}`)
  }
  check(project.id, true)
}

// ── digest ───────────────────────────────────────────────────────────────
function digest() {
  const project = load(projectArg())
  const active = project.iterations.find((i) => i.status === "active")
  const by = (s) => project.hypotheses.filter((h) => h.stage === s)
  console.log(`# ${project.name}`)
  if (active)
    console.log(
      `Active: ${active.name} (${active.start} → ${active.end}) — ${active.goal}`
    )
  console.log(STAGES.map((s) => `${s} ${by(s).length}`).join(" · "))
  console.log(`\n## Being tested`)
  for (const h of by("testing"))
    console.log(
      `- ${h.id} ${h.title}${h.decision ? ` — decided: ${h.decision.verdict}` : ""}\n  ${link(h, project)}`
    )
  const waiting = project.hypotheses.filter((h) => {
    const list = project.comments
      .filter((c) => c.thread === h.id)
      .sort((a, b) => a.at.localeCompare(b.at))
    const ask = list.filter((c) => c.needsClaude && c.author !== "claude").pop()
    return ask && !list.some((c) => c.author === "claude" && c.at > ask.at)
  })
  if (waiting.length) {
    console.log(`\n## Waiting on Claude`)
    for (const h of waiting) console.log(`- ${h.id} ${h.title}`)
  }
  const decided = project.hypotheses.filter((h) => h.decision)
  if (decided.length) {
    console.log(`\n## Decisions`)
    for (const h of decided)
      console.log(`- ${h.id} ${h.decision.verdict}: ${h.decision.answer}`)
  }
}

switch (cmd) {
  case "links":
    links()
    break
  case "check":
    process.exit(check() ? 0 : 1)
    break
  case "merge":
    merge(args[1])
    break
  case "digest":
    digest()
    break
  default:
    console.log(
      readFileSync(fileURLToPath(import.meta.url), "utf8")
        .split("\n")
        .slice(1, 10)
        .join("\n")
        .replace(/^\/\/ ?/gm, "")
    )
}
