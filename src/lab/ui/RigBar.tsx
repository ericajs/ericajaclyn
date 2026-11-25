// The test rig: what you're looking at (target, viewport, zoom), how you're
// working (tools) and what's switched on. Chips show which switches came
// from the hypothesis preset and which you added by hand — a test only
// counts as the hypothesis's test when they match.

import {
  AddCircleIcon,
  ArrowUpRight01Icon,
  Copy01Icon,
  Cursor01Icon,
  Link01Icon,
  PinIcon,
  Refresh01Icon,
  RulerIcon,
  Search01Icon,
  SquareIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"
import { useMemo, useState } from "react"
import { componentMeta } from "../registry/components.meta"
import {
  diffSwitches,
  findSwitch,
  GROUPS,
  optionLabel,
  switchCatalog,
  type SwitchDef,
} from "../engine/switches"
import { presetOf, store, useLab, type Tool } from "../store/store"
import type { AnnotationCategory } from "../types"
import { sameSetup } from "../engine/tests"
import { toast } from "./bus"
import { SavedCheck, SaveTestButton } from "./SavedTests"
import { Icon, IconButton, Popover, TextField } from "./primitives"
import { CATEGORIES, copy } from "./util"
import { designSource, targetById, useMatchedRef } from "./sources"
import { VIEWPORTS, ZOOMS } from "./viewports"

const TOOLS: {
  id: Tool
  label: string
  icon: Parameters<typeof Icon>[0]["icon"]
  key: string
}[] = [
  { id: "interact", label: "Interact", icon: Cursor01Icon, key: "V" },
  { id: "inspect", label: "Inspect specs", icon: Search01Icon, key: "I" },
  { id: "pin", label: "Pin comment", icon: PinIcon, key: "P" },
  { id: "box", label: "Mark area", icon: SquareIcon, key: "B" },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight01Icon, key: "A" },
  { id: "label", label: "Label", icon: Tag01Icon, key: "T" },
  { id: "measure", label: "Measure", icon: RulerIcon, key: "M" },
]

export function RigBar() {
  const project = useLab((s) => s.project)
  const ui = useLab((s) => s.ui)
  const rig = ui.rig
  const vp = rig.viewport!
  const t = targetById(project, rig.target)
  const meta = t?.kind === "component" ? componentMeta(t.component) : undefined
  const h = project.hypotheses.find((x) => x.id === ui.hypothesisId)
  const preset = h ? presetOf(h, project) : null
  const diff = preset ? diffSwitches(rig.switches, preset.switches) : null
  // Any difference counts: props, matrix axes and flow as well as switches
  const setupDiffers = preset && !sameSetup(preset, rig, project)
  const matched = useMatchedRef()
  const groups = useMemo(
    () => [
      ...new Set(
        project.targets.map(
          (x) =>
            x.group ??
            (x.kind === "route"
              ? "Pages"
              : x.kind === "component"
                ? "Components"
                : "Images")
        )
      ),
    ],
    [project.targets]
  )
  const src = designSource(t, rig.props)
  const openHref = src && src.kind !== "proxy" ? src.url : undefined
  const reviewing = rig.mode !== "roadmap"

  if (!reviewing) return null

  return (
    <div className="lab-rig" role="toolbar" aria-label="Test rig">
      <div className="lab-rig-row">
        <label className="lab-inline-field">
          <span className="sr-only">Target</span>
          <select
            value={rig.target ?? ""}
            onChange={(e) =>
              store.setRig({ target: e.target.value, props: undefined })
            }
            aria-label="Target"
            data-tip="What's on the canvas: a page, component or image"
          >
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {project.targets
                  .filter(
                    (x) =>
                      (x.group ??
                        (x.kind === "route"
                          ? "Pages"
                          : x.kind === "component"
                            ? "Components"
                            : "Images")) === g
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        {meta &&
          rig.mode !== "matrix" &&
          Object.entries(meta.axes).map(([k, values]) => (
            <label key={k} className="lab-inline-field">
              <span className="lab-muted">{k}</span>
              <select
                value={rig.props?.[k] ?? meta.defaults[k]}
                onChange={(e) =>
                  store.setRig({
                    props: { ...(rig.props ?? {}), [k]: e.target.value },
                  })
                }
              >
                {values.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
        {t?.kind !== "image" && (
          <>
            <label className="lab-inline-field">
              <span className="sr-only">Viewport</span>
              <select
                aria-label="Viewport"
                data-tip="Viewport size the design renders at"
                value={`${vp.w}x${vp.h}`}
                onChange={(e) => {
                  const [w, hh] = e.target.value.split("x").map(Number)
                  store.setRig({ viewport: { ...vp, w, h: hh } })
                }}
              >
                {!VIEWPORTS.some((v) => v.w === vp.w && v.h === vp.h) && (
                  <option value={`${vp.w}x${vp.h}`}>{`${vp.w}×${vp.h}`}</option>
                )}
                {VIEWPORTS.map((v) => (
                  <option key={v.label} value={`${v.w}x${v.h}`}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="lab-inline-field"
              title="Browser zoom: the CSS viewport shrinks to width ÷ zoom, exactly like real page zoom. 1280 at 400% = 320 CSS px (WCAG 1.4.10)."
            >
              <span className="lab-muted">Zoom</span>
              <select
                aria-label="Zoom"
                value={vp.zoom}
                onChange={(e) =>
                  store.setRig({
                    viewport: { ...vp, zoom: Number(e.target.value) },
                  })
                }
              >
                {ZOOMS.map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div className="lab-tools" role="group" aria-label="Tools">
          {TOOLS.map((tool) => (
            <IconButton
              key={tool.id}
              icon={tool.icon}
              label={tool.label}
              shortcut={tool.key}
              pressed={ui.tool === tool.id}
              onClick={() => store.setUI({ tool: tool.id })}
            />
          ))}
        </div>
        {["pin", "box", "arrow", "label"].includes(ui.tool) && (
          <label className="lab-inline-field">
            <span className="sr-only">Annotation type</span>
            <select
              aria-label="Annotation type"
              data-tip="Category given to new annotations"
              value={ui.category}
              onChange={(e) =>
                store.setUI({ category: e.target.value as AnnotationCategory })
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="lab-row lab-gap-1 lab-push">
          <label className="lab-check">
            <input
              type="checkbox"
              checked={ui.showAnnotations}
              onChange={(e) =>
                store.setUI({ showAnnotations: e.target.checked })
              }
            />{" "}
            Annotations
          </label>
          <label className="lab-check">
            <input
              type="checkbox"
              checked={ui.showFindings}
              onChange={(e) => store.setUI({ showFindings: e.target.checked })}
            />{" "}
            Overlays
          </label>
          <IconButton
            icon={Refresh01Icon}
            label="Reload frames"
            onClick={() => store.reloadFrames()}
          />
          {openHref && (
            <a
              className="lab-icon-btn"
              href={openHref}
              target="_blank"
              rel="noreferrer"
              aria-label="Open frame in a new tab"
              title="Open frame in a new tab"
            >
              <Icon icon={ArrowUpRight01Icon} />
            </a>
          )}
          <IconButton
            icon={Link01Icon}
            label="Copy test link"
            onClick={async () =>
              toast(
                (await copy(store.testLink()))
                  ? "Test link copied"
                  : "Couldn't copy"
              )
            }
          />
        </div>
      </div>

      <div className="lab-rig-row">
        <SwitchCatalog />
        <ul className="lab-chips" aria-label="Active switches">
          {Object.entries(rig.switches).map(([id, value]) => {
            const def = findSwitch(id, project)
            const state = !preset
              ? ""
              : !(id in preset.switches)
                ? "is-added"
                : preset.switches[id] !== value
                  ? "is-changed"
                  : "is-preset"
            return (
              <li
                key={id}
                className={`lab-switch-chip ${state} kind-${def?.kind ?? "simulate"}`}
              >
                <span title={def?.description}>
                  {def?.label ?? id}
                  {value !== "on" && `: ${optionLabel(def, value)}`}
                </span>
                {state === "is-added" && (
                  <span className="sr-only"> (added, not in preset)</span>
                )}
                {state === "is-changed" && (
                  <span className="sr-only"> (changed from preset)</span>
                )}
                <button
                  type="button"
                  aria-label={`Turn off ${def?.label ?? id}`}
                  onClick={() => store.setSwitch(id, null)}
                >
                  ×
                </button>
              </li>
            )
          })}
          {diff?.removed.map((id) => (
            <li key={id} className="lab-switch-chip is-removed">
              <s>{findSwitch(id, project)?.label ?? id}</s>
              <span className="sr-only"> (in preset, turned off)</span>
              <button
                type="button"
                aria-label={`Restore ${id}`}
                onClick={() => store.setSwitch(id, preset!.switches[id])}
              >
                ↺
              </button>
            </li>
          ))}
          {!Object.keys(rig.switches).length && !diff?.removed.length && (
            <li className="lab-muted lab-xs">
              No switches on — add some, or open a hypothesis to load its test.
            </li>
          )}
        </ul>
        <div className="lab-row lab-gap-2 lab-push lab-xs">
          <SavedCheck testRef={matched} />
          {h &&
            (setupDiffers ? (
              <>
                <span
                  className="lab-chip lab-chip-warn"
                  title="The rig differs from the hypothesis's test setup"
                >
                  Deviates from {h.id} preset
                  {diff &&
                  (diff.added.length ||
                    diff.removed.length ||
                    diff.changed.length)
                    ? ` (+${diff.added.length} −${diff.removed.length} ~${diff.changed.length})`
                    : ""}
                </span>
                <button
                  type="button"
                  className="lab-link-btn"
                  onClick={() => store.resetToPreset()}
                >
                  Reset to preset
                </button>
              </>
            ) : (
              <span className="lab-chip lab-chip-pass">
                Running {h.id}&apos;s test setup
              </span>
            ))}
          <SaveTestButton />
          {h && (
            <IconButton
              icon={Copy01Icon}
              label={`Copy ${h.id} preset link`}
              onClick={async () =>
                toast(
                  (await copy(store.testLink(h, presetOf(h, project))))
                    ? "Preset link copied"
                    : "Couldn't copy"
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SwitchCatalog() {
  const project = useLab((s) => s.project)
  const switches = useLab((s) => s.ui.rig.switches)
  const [q, setQ] = useState("")
  const catalog = switchCatalog(project)
  const match = (s: SwitchDef) =>
    !q ||
    `${s.label} ${s.description} ${(s.wcag ?? []).join(" ")} ${s.group}`
      .toLowerCase()
      .includes(q.toLowerCase())
  return (
    <Popover
      label="Test switches"
      className="lab-catalog"
      trigger={(p) => (
        <button type="button" className="lab-btn lab-btn-outline" {...p}>
          <Icon icon={AddCircleIcon} /> Switches
        </button>
      )}
    >
      {() => (
        <>
          <TextField
            type="search"
            className="lab-catalog-search"
            label="Search switches"
            placeholder="Search switches, WCAG criteria…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="lab-catalog-body">
            {GROUPS.map((g) => {
              const list = catalog.filter((s) => s.group === g.id && match(s))
              if (!list.length) return null
              return (
                <section key={g.id} aria-label={g.label}>
                  <h3 className="brow">{g.label}</h3>
                  {list.map((s) => (
                    <div key={s.id} className="lab-catalog-item">
                      <div className="lab-row lab-gap-2">
                        {s.options ? (
                          <label className="lab-inline-field">
                            <span className="lab-strong">{s.label}</span>
                            <select
                              value={switches[s.id] ?? ""}
                              onChange={(e) =>
                                store.setSwitch(s.id, e.target.value || null)
                              }
                            >
                              <option value="">Off</option>
                              {s.options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <label className="lab-check">
                            <input
                              type="checkbox"
                              checked={!!switches[s.id]}
                              onChange={(e) =>
                                store.setSwitch(
                                  s.id,
                                  e.target.checked ? "on" : null
                                )
                              }
                            />
                            <span className="lab-strong">{s.label}</span>
                          </label>
                        )}
                        <span className={`lab-kind kind-${s.kind}`}>
                          {s.kind === "guide" ? "manual" : s.kind}
                        </span>
                        {s.sameOrigin && (
                          <span
                            className="lab-kind"
                            title="Needs DOM access: applies to this build and to production only through the proxy"
                          >
                            DOM
                          </span>
                        )}
                        {s.wcag?.map((w) => (
                          <span key={w} className="lab-chip">
                            {w}
                          </span>
                        ))}
                      </div>
                      <p className="lab-xs lab-muted">{s.description}</p>
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        </>
      )}
    </Popover>
  )
}
