// Test links. Every rig state round-trips through the URL so a hypothesis's
// test setup — or any manual variation of it — is one link away.
//
//   /aidesignlab?p=portfolio&h=H-04&m=review&t=case-naacp&vp=1280x800@4
//       &sw=reflow,text-spacing,theme:dark
//
// Grammar (kept readable on purpose — Claude writes these by hand):
//   sw  = item ("," item)*     item = id | id ":" value
//   vp  = W "x" H ["@" zoom]
//   pp  = prop ":" value ("," prop ":" value)*         component permutation
//   mx  = axis ("," axis)*     axis = kind ":" key ":" v1 "/" v2 …

import type {
  CompareLayout,
  MatrixAxis,
  Mode,
  SwitchState,
  TestSetup,
  ViewportSpec,
} from "../types"

const MODES: Mode[] = ["review", "compare", "flow", "matrix", "roadmap"]

export function encodeSwitches(s: SwitchState): string {
  return Object.entries(s)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => (v === "on" ? k : `${k}:${v}`))
    .join(",")
}

export function decodeSwitches(s: string | null): SwitchState {
  const out: SwitchState = {}
  if (!s) return out
  for (const item of s.split(",")) {
    if (!item) continue
    const i = item.indexOf(":")
    if (i === -1) out[item] = "on"
    else out[item.slice(0, i)] = item.slice(i + 1)
  }
  return out
}

export function encodeViewport(v: ViewportSpec): string {
  return `${v.w}x${v.h}${v.zoom !== 1 ? `@${v.zoom}` : ""}`
}

export function decodeViewport(s: string | null): ViewportSpec | undefined {
  const m = s && /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(s)
  if (!m) return undefined
  return { w: +m[1], h: +m[2], zoom: m[3] ? +m[3] : 1 }
}

function encodeMatrix(axes: MatrixAxis[]): string {
  return axes.map((a) => `${a.kind}:${a.key}:${a.values.join("/")}`).join(",")
}

function decodeMatrix(s: string | null): MatrixAxis[] | undefined {
  if (!s) return undefined
  const axes: MatrixAxis[] = []
  for (const part of s.split(",")) {
    const [kind, key, vals] = [
      part.slice(0, part.indexOf(":")),
      ...splitOnce(part.slice(part.indexOf(":") + 1)),
    ]
    if (!["prop", "switch", "viewport", "target"].includes(kind) || !key)
      continue
    axes.push({
      kind: kind as MatrixAxis["kind"],
      key,
      values: (vals ?? "").split("/").filter(Boolean),
    })
  }
  return axes.length ? axes : undefined
}

// Keys may contain ":" (none do today) — split on the last ":" so values stay intact
function splitOnce(s: string): [string, string] {
  const i = s.lastIndexOf(":")
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)]
}

function encodeProps(p: Record<string, string>): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}:${v}`)
    .join(",")
}

// Leave the readable sub-delimiters unescaped; they are legal in a query.
const enc = (s: string) =>
  encodeURIComponent(s)
    .replace(/%3A/g, ":")
    .replace(/%2C/g, ",")
    .replace(/%2F/g, "/")
    .replace(/%40/g, "@")

export interface LinkState {
  project: string
  hypothesis?: string
  setup: TestSetup
}

export function encodeLink(state: LinkState): string {
  const { setup } = state
  const q: [string, string][] = [["p", state.project]]
  if (state.hypothesis) q.push(["h", state.hypothesis])
  q.push(["m", setup.mode])
  if (setup.target) q.push(["t", setup.target])
  if (setup.flow) q.push(["f", setup.flow])
  if (setup.props && Object.keys(setup.props).length)
    q.push(["pp", encodeProps(setup.props)])
  if (setup.viewport) q.push(["vp", encodeViewport(setup.viewport)])
  if (Object.keys(setup.switches).length)
    q.push(["sw", encodeSwitches(setup.switches)])
  if (setup.compare) q.push(["cmp", setup.compare])
  if (setup.matrix?.length) q.push(["mx", encodeMatrix(setup.matrix)])
  return `?${q.map(([k, v]) => `${k}=${enc(v)}`).join("&")}`
}

export interface DecodedLink {
  project?: string
  hypothesis?: string
  invite?: string
  /** Only the fields present in the URL */
  setup: Partial<TestSetup>
}

export function decodeLink(search: string): DecodedLink {
  const q = new URLSearchParams(search)
  const setup: Partial<TestSetup> = {}
  const m = q.get("m") as Mode | null
  if (m && MODES.includes(m)) setup.mode = m
  if (q.get("t")) setup.target = q.get("t")!
  if (q.get("f")) setup.flow = q.get("f")!
  if (q.has("sw")) setup.switches = decodeSwitches(q.get("sw"))
  const vp = decodeViewport(q.get("vp"))
  if (vp) setup.viewport = vp
  if (q.get("pp")) setup.props = decodeSwitches(q.get("pp"))
  const cmp = q.get("cmp") as CompareLayout | null
  if (cmp && ["side", "swipe", "onion", "diff"].includes(cmp))
    setup.compare = cmp
  const mx = decodeMatrix(q.get("mx"))
  if (mx) setup.matrix = mx
  return {
    project: q.get("p") ?? undefined,
    hypothesis: q.get("h") ?? undefined,
    invite: q.get("invite") ?? undefined,
    setup,
  }
}

export function sameSetup(a: TestSetup, b: TestSetup): boolean {
  return (
    encodeLink({ project: "", setup: a }) ===
    encodeLink({ project: "", setup: b })
  )
}
