// Property specs for the element picked with the Inspect tool.

import { Fragment } from "react"
import { anchorAt } from "../engine/anchor"
import { fmtRatio } from "../engine/color"
import { describeLength } from "../engine/inspect"
import { store, uid, useLab } from "../store/store"
import type { Annotation } from "../types"
import { frames, inspected, toast } from "./bus"
import { Btn } from "./primitives"
import { copy } from "./util"

const sides = (v: number[]) =>
  v.every((x) => x === v[0]) ? `${v[0]}` : v.join(" ")

export function Inspector() {
  const sel = inspected.use((v) => v)
  const tool = useLab((s) => s.ui.tool)
  if (!sel) {
    if (tool !== "inspect") return null
    return (
      <aside className="lab-inspector" aria-label="Inspector">
        <p className="lab-muted">
          Hover to see the box model, click to pin an element&apos;s specs. Hold
          Alt over a second element for the distance between them.
        </p>
      </aside>
    )
  }
  const { spec } = sel
  const rootPx =
    parseFloat(
      sel.el.ownerDocument.defaultView?.getComputedStyle(
        sel.el.ownerDocument.documentElement
      ).fontSize ?? "16"
    ) || 16
  const c = spec.contrast

  const label = () => {
    const doc = frames.get()[sel.frame]?.doc
    const target = store.state.ui.rig.target
    if (!doc || !target || !sel.el.isConnected) return
    const r = sel.el.getBoundingClientRect()
    const w = doc.defaultView!
    const text = [
      spec.type
        ? `${spec.type.family} ${spec.type.size}/${spec.type.lineHeight} ${spec.type.weight}`
        : `${spec.tag} ${spec.rect.w}×${spec.rect.h}`,
      spec.colors[0]?.tokens[0] ?? spec.colors[0]?.hex,
      c && "ratio" in c ? fmtRatio(c.ratio) : null,
    ]
      .filter(Boolean)
      .join(" · ")
    const mine = store.state.project.annotations.filter(
      (a) => a.target === target
    )
    const a: Annotation = {
      id: uid("A"),
      target,
      kind: "label",
      category: "spec",
      points: [anchorAt(doc, r.right - 2, r.top + 2, w.scrollX, w.scrollY)],
      text,
      number: Math.max(0, ...mine.map((x) => x.number)) + 1,
      hypothesis: store.state.ui.hypothesisId,
      viewportW: w.innerWidth,
      author: store.state.ui.identity,
      at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.upsert("annotations", a)
    toast("Spec label added")
  }

  const css = [
    `/* ${spec.selector} */`,
    `width: ${spec.rect.w}px; height: ${spec.rect.h}px;`,
    `padding: ${spec.padding.map((v) => `${v}px`).join(" ")};`,
    spec.margin.some(Boolean)
      ? `margin: ${spec.margin.map((v) => `${v}px`).join(" ")};`
      : "",
    spec.radius !== "0px" ? `border-radius: ${spec.radius};` : "",
    spec.type
      ? `font: ${spec.type.weight} ${spec.type.size}px/${spec.type.lineHeight} "${spec.type.family}";`
      : "",
    spec.type && spec.type.letterSpacing !== "normal"
      ? `letter-spacing: ${spec.type.letterSpacing};`
      : "",
    ...spec.colors.map(
      (x) =>
        `${x.label === "background" ? "background-color" : x.label === "border" ? "border-color" : x.label}: ${x.tokens[0] ? `var(${x.tokens[0]})` : x.hex};`
    ),
  ]
    .filter(Boolean)
    .join("\n")

  return (
    <aside className="lab-inspector" aria-label="Inspector">
      <div className="lab-row lab-gap-2">
        <strong>
          &lt;{spec.tag}&gt; <span className="lab-muted">{spec.role}</span>
        </strong>
        <button
          type="button"
          className="lab-icon-btn lab-push"
          aria-label="Clear selection"
          onClick={() => inspected.set(null)}
        >
          ✕
        </button>
      </div>
      <code className="lab-xs lab-selector">{spec.selector}</code>
      {spec.name && (
        <p className="lab-xs">Accessible name: “{spec.name.slice(0, 80)}”</p>
      )}
      <dl className="lab-spec">
        <dt>Size</dt>
        <dd>
          {spec.rect.w} × {spec.rect.h}
        </dd>
        <dt>Padding</dt>
        <dd>
          {spec.padding.some(Boolean)
            ? spec.padding
                .map((p) => describeLength(p, rootPx).split(" · ")[0])
                .join(" ")
            : "0"}
        </dd>
        {spec.padding.some(Boolean) && (
          <>
            <dt />
            <dd className="lab-muted lab-xs">
              {describeLength(spec.padding[0], rootPx)}
            </dd>
          </>
        )}
        <dt>Margin</dt>
        <dd>{sides(spec.margin)}</dd>
        <dt>Border</dt>
        <dd>{sides(spec.border)}</dd>
        <dt>Radius</dt>
        <dd>{spec.radius}</dd>
        {spec.type && (
          <>
            <dt>Type</dt>
            <dd>
              {spec.type.family} · {spec.type.size}px / {spec.type.lineHeight} ·{" "}
              {spec.type.weight}
              {spec.type.letterSpacing !== "normal"
                ? ` · ${spec.type.letterSpacing}`
                : ""}
              {spec.type.transform !== "none"
                ? ` · ${spec.type.transform}`
                : ""}
            </dd>
          </>
        )}
        {spec.colors.map((x) => (
          <Fragment key={x.label}>
            <dt>{x.label}</dt>
            <dd>
              <span
                className="lab-swatch"
                style={{ background: x.hex }}
                aria-hidden="true"
              />{" "}
              {x.hex}{" "}
              {x.tokens.length ? (
                <span className="lab-token">
                  {x.tokens.slice(0, 2).join(", ")}
                </span>
              ) : (
                <span className="lab-chip lab-chip-warn">no token</span>
              )}
            </dd>
          </Fragment>
        ))}
        {c && (
          <>
            <dt>Contrast</dt>
            <dd>
              {"ratio" in c ? (
                <>
                  <strong className={c.aa ? "lab-pass" : "lab-fail"}>
                    {fmtRatio(c.ratio)}
                  </strong>{" "}
                  {c.aa ? "AA ✓" : "AA ✗"} {c.aaa ? "AAA ✓" : "AAA ✗"}
                  {c.large ? " (large)" : ""} · APCA Lc{" "}
                  {Math.round(Math.abs(c.apca))}
                  <div className="lab-xs lab-muted">
                    {c.fg} on {c.bg}
                  </div>
                </>
              ) : (
                <span className="lab-muted">Unknown — {c.unknown}</span>
              )}
            </dd>
          </>
        )}
      </dl>
      {spec.colors.some((x) => !x.tokens.length) && (
        <p className="lab-xs lab-muted">
          “no token” = the value doesn&apos;t match any custom property on :root
          — a hard-coded color or a candidate for a token.
        </p>
      )}
      <div className="lab-row lab-gap-2">
        <Btn onClick={label}>Add spec label</Btn>
        <Btn
          onClick={async () =>
            toast((await copy(css)) ? "CSS copied" : "Copy failed")
          }
        >
          Copy CSS
        </Btn>
      </div>
    </aside>
  )
}
