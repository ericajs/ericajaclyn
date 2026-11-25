// The collaboration channel between the browser and the repo.
//
//   you / contributors ──(handoff file)──▶ Claude ──(commit to projects/*.json)──▶ preview build
//
// A handoff is plain JSON (merge with `node scripts/lab.mjs merge <file>`)
// plus a Markdown digest you can paste straight into a Claude session: it
// lists what needs a response first, then embeds the JSON.

import { encodeLink } from "../engine/url"
import {
  STAGE_META,
  type Collection,
  type Comment,
  type Hypothesis,
  type Project,
  type SavedTest,
} from "../types"
import { imageDataUrl, importDataUrl } from "./images"
import { personName, store } from "./store"

export interface HandoffFile {
  kind: "design-lab-handoff"
  schema: 1
  project: string
  exportedAt: string
  from: { id: string; name: string; role: string }
  entities: Partial<Record<Collection, Record<string, unknown>[]>>
  deleted: Record<string, string>
  images?: Record<string, string>
}

function imageRefs(entities: HandoffFile["entities"]): string[] {
  const refs = new Set<string>()
  const scan = (v: unknown) => {
    if (typeof v === "string" && v.startsWith("idb:")) refs.add(v)
    else if (Array.isArray(v)) v.forEach(scan)
    else if (v && typeof v === "object") Object.values(v).forEach(scan)
  }
  scan(entities)
  return [...refs]
}

export async function buildHandoff(
  opts: { all?: boolean; images?: boolean } = {}
): Promise<HandoffFile> {
  const { entities, deleted } = store.dirtyEntities(opts.all)
  const me = store.me()
  const file: HandoffFile = {
    kind: "design-lab-handoff",
    schema: 1,
    project: store.state.ui.projectId,
    exportedAt: new Date().toISOString(),
    from: { id: me.id, name: me.name, role: me.role },
    entities: entities as HandoffFile["entities"],
    deleted,
  }
  if (opts.images) {
    const images: Record<string, string> = {}
    for (const ref of imageRefs(file.entities)) {
      const d = await imageDataUrl(ref)
      if (d) images[ref] = d
    }
    if (Object.keys(images).length) file.images = images
  }
  return file
}

const line = (s: string) => s.replace(/\s+/g, " ").trim()

export function digest(file: HandoffFile, project: Project): string {
  const out: string[] = []
  const name = (id: string) => personName(project, id)
  const hyp = (id?: string) => project.hypotheses.find((h) => h.id === id)
  const title = (id: string) => {
    const h = hyp(id)
    if (h) return `${h.id} "${h.title}"`
    const a = project.annotations.find((x) => x.id === id)
    if (a) return `annotation #${a.number} on ${a.target}`
    const n = project.notes.find((x) => x.id === id)
    if (n) return `note "${n.title}"`
    const i = project.improvements.find((x) => x.id === id)
    if (i) return `improvement "${i.title}"`
    return id
  }
  const comments = (file.entities.comments ?? []) as unknown as Comment[]
  const hyps = (file.entities.hypotheses ?? []) as unknown as Hypothesis[]

  out.push(
    `## Design Lab handoff · ${project.name} · ${file.exportedAt.slice(0, 16).replace("T", " ")} UTC`
  )
  out.push(
    `From ${file.from.name} (${file.from.role}). Merge the JSON below into \`src/lab/projects/${file.project}.json\` (\`node scripts/lab.mjs merge <file>\`), then respond to everything under "Needs Claude".`
  )

  const needs = comments.filter((c) => c.needsClaude)
  out.push(`\n### Needs Claude (${needs.length})`)
  for (const c of needs)
    out.push(`- On ${title(c.thread)} — ${name(c.author)}: "${line(c.body)}"`)
  if (!needs.length) out.push("- Nothing flagged.")

  const decided = hyps.filter((h) => h.decision)
  if (decided.length) {
    out.push(`\n### Decisions (${decided.length})`)
    for (const h of decided) {
      const d = h.decision!
      out.push(
        `- ${h.id} "${h.title}" → **${d.verdict}** by ${name(d.author)}: "${line(d.answer)}"`
      )
      out.push(
        `  - Tested with: \`${encodeLink({ project: project.id, hypothesis: h.id, setup: d.snapshot })}\``
      )
    }
  }

  const moved = hyps.filter((h) => {
    const last = h.stageHistory?.[h.stageHistory.length - 1]
    return last && last.at > (store.state.overlay.lastHandoff ?? "")
  })
  if (moved.length) {
    out.push(`\n### Stage changes`)
    for (const h of moved)
      out.push(`- ${h.id} "${h.title}" → ${STAGE_META[h.stage].label}`)
  }

  const evidence = hyps.flatMap((h) =>
    (h.evidence ?? [])
      .filter((e) => e.at > (store.state.overlay.lastHandoff ?? ""))
      .map((e) => ({ h, e }))
  )
  if (evidence.length) {
    out.push(`\n### New evidence (${evidence.length})`)
    for (const { h, e } of evidence.slice(0, 30))
      out.push(`- ${h.id}: [${e.kind}] ${line(e.body).slice(0, 220)}`)
  }

  const other = comments.filter((c) => !c.needsClaude)
  if (other.length) {
    out.push(`\n### Other comments (${other.length})`)
    for (const c of other.slice(0, 30))
      out.push(
        `- On ${title(c.thread)} — ${name(c.author)}: "${line(c.body).slice(0, 200)}"`
      )
  }

  // Saved test versions: the latest of each, ready to act on
  const tests = (file.entities.tests ?? []) as unknown as SavedTest[]
  if (tests.length) {
    out.push(`\n### Saved test versions`)
    for (const t of tests) {
      const v = t.versions.at(-1)
      if (!v) continue
      out.push(
        `\n**${t.id} v${v.version}** — ${t.name} · ${v.date} · ${name(v.author)}${v.hypothesis ? ` · ${v.hypothesis}` : ""}${v.message ? `\n> ${line(v.message)}` : ""}\n\n\`\`\`diff\n${v.changelog.join("\n")}\n\`\`\``
      )
      const failing = v.results.filter((r) => r.fail > 0)
      if (v.results.length)
        out.push(
          `Results: ${v.results.length} checks, ${failing.length ? failing.map((r) => `${r.check}@${r.frame} fail ${r.fail}`).join("; ") : "no failures"}`
        )
    }
  }

  const count = (c: Collection) => file.entities[c]?.length ?? 0
  out.push(
    `\n### Also included\n- ${count("annotations")} annotations, ${count("notes")} notes, ${count("improvements")} improvements, ${count("people")} people, ${Object.keys(file.deleted).length} deletions${file.images ? `, ${Object.keys(file.images).length} images` : ""}`
  )

  const json = JSON.stringify({ ...file, images: undefined }, null, 1)
  out.push(
    `\n<details><summary>Handoff JSON${file.images ? " (images omitted — attach the downloaded file for those)" : ""}</summary>\n\n\`\`\`json\n${json}\n\`\`\`\n</details>`
  )
  return out.join("\n")
}

export function download(
  name: string,
  content: string,
  type = "application/json"
) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Import a contributor's handoff. Their entities stay marked unsent so they reach Claude in your next handoff. */
export async function importHandoff(
  text: string
): Promise<{ count: number; error?: string }> {
  let file: HandoffFile
  try {
    file = JSON.parse(text)
  } catch {
    return { count: 0, error: "Not valid JSON." }
  }
  if (file.kind !== "design-lab-handoff")
    return { count: 0, error: "Not a Design Lab handoff file." }
  if (file.project !== store.state.ui.projectId)
    return { count: 0, error: `This handoff is for project "${file.project}".` }
  let count = 0
  for (const [c, list] of Object.entries(file.entities) as [
    Collection,
    { id: string; updatedAt?: string }[],
  ][]) {
    for (const e of list) {
      const existing = (
        store.state.project[c] as unknown as {
          id: string
          updatedAt?: string
        }[]
      ).find((x) => x.id === e.id)
      if (existing && (existing.updatedAt ?? "") > (e.updatedAt ?? "")) continue
      store.upsert(c, e as never, { touch: false })
      count++
    }
  }
  for (const [id, at] of Object.entries(file.deleted ?? {})) {
    for (const c of Object.keys(store.state.project) as Collection[]) {
      const list = store.state.project[c] as unknown
      if (
        Array.isArray(list) &&
        list.some(
          (x: { id: string; updatedAt?: string }) =>
            x.id === id && (x.updatedAt ?? "") <= at
        )
      )
        store.remove(c, id)
    }
  }
  for (const [ref, data] of Object.entries(file.images ?? {}))
    await importDataUrl(ref, data)
  return { count }
}
