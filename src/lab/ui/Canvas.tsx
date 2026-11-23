import { useState } from "react"
import { encodeViewport } from "../engine/url"
import { store, useLab } from "../store/store"
import type { CompareLayout } from "../types"
import { frames } from "./bus"
import { Findings } from "./Findings"
import { FlowView } from "./FlowView"
import { FrameView } from "./FrameView"
import { Inspector } from "./Inspector"
import { MatrixView } from "./MatrixView"
import { Segmented } from "./primitives"
import { Roadmap } from "./Roadmap"
import {
  designSource,
  prodSource,
  targetById,
  targetLabel,
  useBox,
} from "./sources"

export function Canvas() {
  const mode = useLab((s) => s.ui.rig.mode)
  if (mode === "roadmap") return <Roadmap />
  return (
    <div className="lab-canvas">
      {mode === "review" && <ReviewStage />}
      {mode === "compare" && <CompareStage />}
      {mode === "flow" && <FlowView />}
      {mode === "matrix" && <MatrixView />}
      <Inspector />
      <Findings />
    </div>
  )
}

function FrameMeta({
  frameKey,
  label,
  extra,
}: {
  frameKey: string
  label: string
  extra?: string
}) {
  const info = frames.use((f) => f[frameKey])
  const rig = useLab((s) => s.ui.rig)
  const vp = rig.viewport!
  return (
    <div className="lab-frame-meta">
      <span className="lab-strong">{label}</span>
      <span>
        {encodeViewport(vp).replace("@", " @ ")}
        {vp.zoom !== 1 ? `${"×"} → ${Math.round(vp.w / vp.zoom)} CSS px` : ""}
      </span>
      {extra && <span>{extra}</span>}
      {info?.crossOrigin && (
        <span className="lab-chip lab-chip-warn">
          Cross-origin: {info.unsupported.length} switch(es) can't reach it
        </span>
      )}
      {info?.path &&
        info.sourcePath &&
        info.path.replace(/\/$/, "") !== info.sourcePath.replace(/\/$/, "") && (
          <NavigatedAway path={info.path} />
        )}
      {info?.error && (
        <span className="lab-chip lab-chip-warn">{info.error}</span>
      )}
    </div>
  )
}

/** The frame was navigated to another page: offer to make it the target. */
function NavigatedAway({ path }: { path: string }) {
  const project = useLab((s) => s.project)
  const match = project.targets.find(
    (t) =>
      t.kind === "route" &&
      (t.path.replace(/\/$/, "") || "/") === (path.replace(/\/$/, "") || "/")
  )
  return (
    <span className="lab-chip lab-chip-warn">
      Now showing {path}
      {match ? (
        <button
          type="button"
          className="lab-link-btn"
          onClick={() => store.setRig({ target: match.id })}
        >
          Make “{match.name}” the target
        </button>
      ) : (
        " — not a target, annotations hidden"
      )}
    </span>
  )
}

function ReviewStage() {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const reloadKey = useLab((s) => s.ui.reloadKey)
  const [ref, box] = useBox<HTMLDivElement>()
  const t = targetById(project, rig.target)
  const src = designSource(t, rig.props)
  return (
    <div className="lab-stage-wrap">
      <FrameMeta
        frameKey="design"
        label={`Design · ${targetLabel(t, rig.props)}`}
      />
      <div className="lab-stage" ref={ref}>
        {src ? (
          <FrameView
            frameKey="design"
            label={`Design: ${targetLabel(t, rig.props)}`}
            source={src}
            viewport={rig.viewport!}
            switches={rig.switches}
            box={{ w: box.w - 32, h: box.h - 32 }}
            project={project}
            annotationsTarget={t?.id}
            tools
            reloadKey={reloadKey}
          />
        ) : (
          <p className="lab-empty">Pick a target in the toolbar.</p>
        )}
      </div>
    </div>
  )
}

function CompareStage() {
  const project = useLab((s) => s.project)
  const rig = useLab((s) => s.ui.rig)
  const reloadKey = useLab((s) => s.ui.reloadKey)
  const [ref, box] = useBox<HTMLDivElement>()
  const [split, setSplit] = useState(50)
  const [opacity, setOpacity] = useState(50)
  const [scrollY, setScrollY] = useState(0)
  const layout: CompareLayout = rig.compare ?? "side"
  const t = targetById(project, rig.target)
  const design = designSource(t, rig.props)
  const prod = prodSource(t, project)

  const header = (
    <div className="lab-compare-bar">
      <Segmented<CompareLayout>
        label="Compare layout"
        value={layout}
        onChange={(v) => store.setRig({ compare: v })}
        options={[
          { value: "side", label: "Side by side" },
          { value: "swipe", label: "Swipe" },
          { value: "onion", label: "Onion skin" },
          { value: "diff", label: "Difference" },
        ]}
      />
      {layout === "swipe" && (
        <label className="lab-range">
          Split{" "}
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(+e.target.value)}
          />
        </label>
      )}
      {layout === "onion" && (
        <label className="lab-range">
          Production opacity{" "}
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(+e.target.value)}
          />
        </label>
      )}
      <span className="lab-muted lab-xs">
        Left/bottom = this build · right/top = production ({project.prodOrigin}
        {project.prodProxy ? ` via ${project.prodProxy}` : ""}). Scroll is
        synced.
      </span>
    </div>
  )

  if (!design || !prod) {
    return (
      <div className="lab-stage-wrap">
        {header}
        <p className="lab-empty">
          Compare needs a route target — components and images have no
          production URL.
        </p>
      </div>
    )
  }

  const side = layout === "side"
  const fbox = side
    ? { w: box.w / 2 - 24, h: box.h - 32 }
    : { w: box.w - 32, h: box.h - 32 }
  const common = {
    viewport: rig.viewport!,
    switches: rig.switches,
    project,
    reloadKey,
    scrollY,
    onScrollY: setScrollY,
  }
  const prodStyle =
    layout === "swipe"
      ? { clipPath: `inset(0 0 0 ${split}%)` }
      : layout === "onion"
        ? { opacity: opacity / 100 }
        : layout === "diff"
          ? { mixBlendMode: "difference" as const }
          : undefined

  return (
    <div className="lab-stage-wrap">
      {header}
      <div className="lab-stage" ref={ref}>
        {side ? (
          <div className="lab-compare-side">
            <div>
              <FrameMeta frameKey="design" label="This build" />
              <FrameView
                frameKey="design"
                label={`This build: ${t?.name}`}
                source={design}
                box={fbox}
                annotationsTarget={t?.id}
                tools
                {...common}
              />
            </div>
            <div>
              <FrameMeta frameKey="prod" label="Production" />
              <FrameView
                frameKey="prod"
                label={`Production: ${t?.name}`}
                source={prod}
                box={fbox}
                {...common}
              />
            </div>
          </div>
        ) : (
          <div className="lab-compare-stack">
            <FrameView
              frameKey="design"
              label={`This build: ${t?.name}`}
              source={design}
              box={fbox}
              annotationsTarget={t?.id}
              tools
              {...common}
            />
            {/* Blend and clip on this wrapper, not the iframe: the frame's scaled
                inner box is its own stacking context and would isolate the blend */}
            <div
              className="lab-compare-top"
              style={{
                ...prodStyle,
                pointerEvents:
                  layout === "onion" || layout === "diff" ? "none" : undefined,
              }}
            >
              <FrameView
                frameKey="prod"
                label={`Production: ${t?.name}`}
                source={prod}
                box={fbox}
                analyzeSwitches={false}
                {...common}
              />
            </div>
            {layout === "swipe" && (
              <div
                className="lab-swipe-handle"
                style={{ left: `${split}%` }}
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
