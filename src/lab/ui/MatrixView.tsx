// Matrix: permutations and batch tests. Any two axes — component props,
// switch values, viewports or targets — become a grid of live frames. Every
// cell runs the active checks, so the grid doubles as a batch report.

import { useMemo } from "react"
import { componentMeta } from "../registry/components.meta"
import { optionLabel, switchCatalog } from "../engine/switches"
import { store, useLab } from "../store/store"
import type { MatrixAxis, SwitchState, TestSetup, ViewportSpec } from "../types"
import { frames } from "./bus"
import { failCounts } from "./util"
import { FrameView } from "./FrameView"
import { designSource, targetById, targetLabel, useBox } from "./sources"
import { parseVp, VIEWPORTS } from "./viewports"

const MAX_CELLS = 36
const NONE = "∅"

interface Cell {
  key: string
  label: string
  setup: TestSetup
}

function axisValues(axis: MatrixAxis): string[] {
  return axis.values.length ? axis.values : [NONE]
}

function applyAxis(
  setup: TestSetup,
  axis: MatrixAxis,
  value: string
): TestSetup {
  if (axis.kind === "prop")
    return { ...setup, props: { ...(setup.props ?? {}), [axis.key]: value } }
  if (axis.kind === "target") return { ...setup, target: value }
  if (axis.kind === "viewport")
    return { ...setup, viewport: parseVp(value) ?? setup.viewport }
  const switches: SwitchState = { ...setup.switches }
  if (value === NONE || value === "off") delete switches[axis.key]
  else switches[axis.key] = value
  return { ...setup, switches }
}

export function MatrixView() {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const reloadKey = useLab((s) => s.ui.reloadKey)
  const all = frames.use((f) => f)
  const [ref, box] = useBox<HTMLDivElement>()
  const axes = rig.matrix?.length ? rig.matrix : defaultAxes(rig, project)
  const catalog = switchCatalog(project)

  const valueLabel = (axis: MatrixAxis, v: string) => {
    if (v === NONE || v === "off") return "Off"
    if (axis.kind === "switch")
      return optionLabel(
        catalog.find((s) => s.id === axis.key),
        v
      )
    if (axis.kind === "target") return targetById(project, v)?.name ?? v
    return v
  }

  const cells: Cell[][] = useMemo(() => {
    const [a, b] = axes
    const rows = b ? axisValues(b) : [null]
    return rows.map((rv) =>
      axisValues(a).map((cv) => {
        let setup = applyAxis(rig, a, cv)
        if (b && rv !== null) setup = applyAxis(setup, b, rv)
        const label = [
          valueLabel(a, cv),
          b && rv !== null ? valueLabel(b, rv) : null,
        ]
          .filter(Boolean)
          .join(" · ")
        return {
          key: `mx-${a.key}-${cv}-${b?.key ?? ""}-${rv ?? ""}`,
          label,
          setup,
        }
      })
    )
  }, [axes, rig]) // eslint-disable-line react-hooks/exhaustive-deps

  const count = cells.flat().length
  // One axis wraps into as many columns as fit; two axes keep a true grid
  const wanted = cells[0]?.length ?? 1
  const fitCols = Math.max(1, Math.floor((box.w - 24 + 12) / (260 + 12)))
  const cols = axes.length > 1 ? wanted : Math.min(wanted, fitCols)
  const cellW = Math.max(
    180,
    Math.min(420, Math.floor((box.w - 24 - (cols - 1) * 12) / cols))
  )

  return (
    <div className="lab-stage-wrap">
      <AxisEditor axes={axes} />
      <div
        className="lab-stage lab-stage-scroll"
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label="Matrix cells"
      >
        {count > MAX_CELLS ? (
          <p className="lab-empty">
            {count} cells — narrow an axis to {MAX_CELLS} or fewer. Each cell is
            a live page.
          </p>
        ) : (
          <div
            className="lab-matrix"
            style={{ gridTemplateColumns: `repeat(${cols}, ${cellW}px)` }}
            role="list"
            aria-label="Permutation matrix"
          >
            {cells.flat().map((c) => {
              const t = targetById(project, c.setup.target)
              const src = designSource(t, c.setup.props)
              const vp: ViewportSpec = c.setup.viewport!
              const h = Math.min(
                Math.round((cellW * vp.h) / vp.w),
                t?.kind === "component" ? 220 : 520
              )
              const fails = failCounts(all[c.key]?.analyses)
              return (
                <div key={c.key} className="lab-cell" role="listitem">
                  <div className="lab-cell-head">
                    <strong>{c.label}</strong>
                    <button
                      type="button"
                      className="lab-link-btn lab-push"
                      onClick={() =>
                        store.setRig({
                          ...c.setup,
                          mode: "review",
                          matrix: rig.matrix,
                        })
                      }
                    >
                      Open
                    </button>
                  </div>
                  {src ? (
                    <FrameView
                      frameKey={c.key}
                      label={`${targetLabel(t, c.setup.props)} — ${c.label}`}
                      source={src}
                      viewport={vp}
                      switches={c.setup.switches}
                      box={{ w: cellW, h }}
                      project={project}
                      compact
                      reloadKey={reloadKey}
                    />
                  ) : (
                    <p className="lab-empty">No target</p>
                  )}
                  <div className="lab-story-foot">
                    {fails.map((f) => (
                      <span key={f.id} className="lab-chip lab-chip-fail">
                        {f.id}: {f.n}
                      </span>
                    ))}
                    {!fails.length &&
                      Object.keys(all[c.key]?.analyses ?? {}).length > 0 && (
                        <span className="lab-chip lab-chip-pass">
                          No failures
                        </span>
                      )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function defaultAxes(
  rig: TestSetup,
  project: ReturnType<typeof store.getState>["project"]
): MatrixAxis[] {
  const t = targetById(project, rig.target)
  if (t?.kind === "component") {
    const meta = componentMeta(t.component)
    const keys = Object.keys(meta?.axes ?? {})
    // A component with no props (e.g. the token specimen) has nothing to
    // permute, so it gets the viewport grid like a route
    if (keys.length)
      return keys
        .slice(0, 2)
        .map((k) => ({ kind: "prop" as const, key: k, values: meta!.axes[k] }))
  }
  return [
    {
      kind: "viewport",
      key: "viewport",
      values: ["375x667", "768x1024", "1280x800"],
    },
  ]
}

function AxisEditor({ axes }: { axes: MatrixAxis[] }) {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const catalog = switchCatalog(project).filter((s) => s.kind !== "guide")
  const t = targetById(project, rig.target)
  const meta = t?.kind === "component" ? componentMeta(t.component) : undefined

  const setAxes = (next: MatrixAxis[]) => store.setRig({ matrix: next })
  const keyOptions = (kind: MatrixAxis["kind"]) => {
    if (kind === "prop")
      return Object.keys(meta?.axes ?? {}).map((k) => ({ value: k, label: k }))
    if (kind === "switch")
      return catalog.map((s) => ({ value: s.id, label: s.label }))
    if (kind === "viewport") return [{ value: "viewport", label: "Viewport" }]
    return [{ value: "target", label: "Target" }]
  }
  const allValues = (axis: MatrixAxis): { value: string; label: string }[] => {
    if (axis.kind === "prop")
      return (meta?.axes[axis.key] ?? []).map((v) => ({ value: v, label: v }))
    if (axis.kind === "switch") {
      const s = catalog.find((x) => x.id === axis.key)
      return [
        { value: NONE, label: "Off" },
        ...(s?.options ?? [{ value: "on", label: "On" }]),
      ]
    }
    if (axis.kind === "viewport")
      return VIEWPORTS.map((v) => ({
        value: `${v.w}x${v.h}`,
        label: v.label,
      })).concat([
        { value: "1280x800@4", label: "1280 @ 400% (reflow)" },
        { value: "1280x800@2", label: "1280 @ 200%" },
      ])
    return project.targets
      .filter((x) => x.kind === t?.kind || !t)
      .map((x) => ({ value: x.id, label: x.name }))
  }
  const update = (i: number, patch: Partial<MatrixAxis>) => {
    const next = axes.map((a, j) => (j === i ? { ...a, ...patch } : a))
    if (patch.kind || patch.key) {
      const a = next[i]
      if (patch.kind) a.key = keyOptions(a.kind)[0]?.value ?? ""
      a.values = allValues(a)
        .map((v) => v.value)
        .slice(0, 6)
    }
    setAxes(next)
  }

  return (
    <div className="lab-axis-bar" aria-label="Matrix axes">
      {axes.map((axis, i) => (
        <fieldset key={i} className="lab-axis">
          <legend>{i === 0 ? "Columns" : "Rows"}</legend>
          <select
            aria-label="Axis kind"
            data-tip="What this axis varies: prop, switch, viewport or target"
            value={axis.kind}
            onChange={(e) =>
              update(i, { kind: e.target.value as MatrixAxis["kind"] })
            }
          >
            {meta && <option value="prop">Component prop</option>}
            <option value="switch">Switch</option>
            <option value="viewport">Viewport</option>
            <option value="target">Target</option>
          </select>
          {keyOptions(axis.kind).length > 1 && (
            <select
              aria-label="Axis key"
              data-tip="Which prop, switch or target set this axis varies"
              value={axis.key}
              onChange={(e) => update(i, { key: e.target.value })}
            >
              {keyOptions(axis.kind).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <div className="lab-axis-values">
            {allValues(axis).map((v) => (
              <label key={v.value} className="lab-check">
                <input
                  type="checkbox"
                  checked={axis.values.includes(v.value)}
                  onChange={(e) =>
                    update(i, {
                      values: e.target.checked
                        ? [...axis.values, v.value]
                        : axis.values.filter((x) => x !== v.value),
                    })
                  }
                />
                {v.label}
              </label>
            ))}
          </div>
          {axes.length > 1 && (
            <button
              type="button"
              className="lab-link-btn"
              onClick={() => setAxes(axes.filter((_, j) => j !== i))}
            >
              Remove axis
            </button>
          )}
        </fieldset>
      ))}
      {axes.length < 2 && (
        <button
          type="button"
          className="lab-btn lab-btn-outline"
          onClick={() =>
            setAxes([
              ...axes,
              { kind: "switch", key: "theme", values: ["light", "dark"] },
            ])
          }
        >
          Add row axis
        </button>
      )}
    </div>
  )
}
