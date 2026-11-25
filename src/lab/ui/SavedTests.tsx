// Saved tests UI: the header's Saved menu, the rig's light-gray checkmark,
// the save dialog (a version is a commit: v2.0.0+ needs a message), and the
// version history shown on a question's Test setup card.

import {
  Bookmark02Icon,
  FloppyDiskIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { useState } from "react"
import {
  captureContext,
  captureResults,
  changelog,
  findTest,
  latestRef,
  nextTestId,
  nextVersion,
  normalizeSetup,
  refLabel,
  vLabel,
} from "../engine/tests"
import { personName, store, useLab } from "../store/store"
import type { CheckResult, TestRef, TestVersion } from "../types"
import { frames, toast } from "./bus"
import { Btn, Dialog, Icon, Popover, TextField } from "./primitives"

/** Light-gray checkmark: what's on screen is a saved test version. */
export function SavedCheck({ testRef: r }: { testRef?: TestRef }) {
  if (!r) return null
  return (
    <span
      className="lab-saved-check"
      title={`On screen exactly matches saved test ${refLabel(r)}`}
    >
      <span className="lab-saved-tick" aria-hidden="true">
        <Icon icon={Tick02Icon} size={14} />
      </span>
      <span className="sr-only">Saved: </span>
      <code>{r.test}</code> {vLabel(r.version)}
    </span>
  )
}

// ── Header: Saved menu ───────────────────────────────────────────────────

export function SavedMenu() {
  const project = useLab((s) => s.project)
  const loaded = useLab((s) => s.ui.loadedTest)
  const tests = project.tests
  const usedBy = (id: string) =>
    project.hypotheses.filter((h) => h.testRef?.test === id).map((h) => h.id)

  return (
    <Popover
      label="Saved tests"
      align="end"
      className="lab-saved-menu"
      trigger={(p) => (
        <button
          type="button"
          className={`lab-btn lab-btn-outline ${loaded ? "is-loaded" : ""}`}
          {...p}
        >
          <Icon icon={Bookmark02Icon} /> Saved
          <span className="lab-count">{tests.length}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="lab-saved-list">
          <p className="lab-saved-list-head">
            Saved tests <span className="lab-muted">· load one to run it</span>
          </p>
          {!tests.length && (
            <p className="lab-muted lab-xs">
              Nothing saved yet. Use “Save test” in the test rig.
            </p>
          )}
          <ul>
            {tests.map((t) => {
              const isLoaded = loaded?.test === t.id
              const latest = t.versions.at(-1)!
              const users = usedBy(t.id)
              return (
                <li key={t.id} className={isLoaded ? "is-loaded" : ""}>
                  <button
                    type="button"
                    className="lab-saved-item"
                    aria-current={isLoaded ? "true" : undefined}
                    onClick={() => {
                      store.loadTest(latestRef(t))
                      toast(`Loaded ${t.id} ${vLabel(latest.version)}`)
                      close()
                    }}
                  >
                    <span className="lab-saved-tick" aria-hidden="true">
                      {isLoaded && <Icon icon={Tick02Icon} size={14} />}
                    </span>
                    <span className="lab-saved-main">
                      <span className="lab-saved-title">
                        <code>{t.id}</code> {t.name}
                      </span>
                      <span className="lab-saved-meta">
                        {vLabel(latest.version)} · {latest.date}
                        {users.length ? ` · ${users.join(", ")}` : ""}
                        {isLoaded ? ` · loaded ${vLabel(loaded!.version)}` : ""}
                      </span>
                    </span>
                  </button>
                  {t.versions.length > 1 && (
                    <div
                      className="lab-saved-versions"
                      role="group"
                      aria-label={`${t.id} versions`}
                    >
                      {t.versions.map((v) => {
                        const on = isLoaded && loaded!.version === v.version
                        return (
                          <button
                            key={v.version}
                            type="button"
                            className="lab-link-btn"
                            aria-pressed={on}
                            onClick={() => {
                              store.loadTest({ test: t.id, version: v.version })
                              toast(`Loaded ${t.id} ${vLabel(v.version)}`)
                              close()
                            }}
                          >
                            {vLabel(v.version)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Popover>
  )
}

// ── Rig: save button + dialog ────────────────────────────────────────────

export function SaveTestButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="lab-link-btn lab-save-btn"
        onClick={() => setOpen(true)}
      >
        <Icon icon={FloppyDiskIcon} size={14} /> Save test
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Save test" wide>
        <SaveTestForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  )
}

function SaveTestForm({ onDone }: { onDone: () => void }) {
  const project = useLab((s) => s.project)
  const ui = useLab((s) => s.ui)
  const h = project.hypotheses.find((x) => x.id === ui.hypothesisId)
  const loaded = findTest(project, ui.loadedTest?.test)
  const [kind, setKind] = useState<"version" | "new">(
    loaded ? "version" : "new"
  )
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  // Results are captured once, when the dialog opens: what you saw is what's saved
  const [results] = useState<CheckResult[]>(() => captureResults(frames.get()))
  const target = kind === "version" ? loaded : undefined
  const version = nextVersion(target)
  const id = target?.id ?? nextTestId(project)
  const needsMessage = Boolean(target)
  const [pin, setPin] = useState(
    () => !!h && (!h.testRef || h.testRef.test === loaded?.id)
  )

  const lines = changelog(
    target?.versions.at(-1),
    {
      setup: normalizeSetup(ui.rig, project),
      results,
      context: captureContext(project, h),
    },
    project
  )

  const canSave = needsMessage
    ? message.trim().length > 0
    : name.trim().length > 0
  const save = () => {
    if (!canSave) return
    const ref = store.saveTest({
      testId: target?.id,
      name,
      message,
      results,
      pin: pin && !!h,
    })
    toast(`Saved ${refLabel(ref)}${pin && h ? ` · ${h.id} now runs it` : ""}`)
    onDone()
  }

  return (
    <form
      className="lab-save-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {loaded && (
        <fieldset className="lab-save-kind">
          <legend className="sr-only">What to save</legend>
          <label className="lab-check">
            <input
              type="radio"
              name="kind"
              checked={kind === "version"}
              onChange={() => setKind("version")}
            />{" "}
            New version of <code>{loaded.id}</code> {loaded.name}
          </label>
          <label className="lab-check">
            <input
              type="radio"
              name="kind"
              checked={kind === "new"}
              onChange={() => setKind("new")}
            />{" "}
            New test
          </label>
        </fieldset>
      )}

      <p className="lab-save-target">
        Saving <code>{id}</code> <strong>{vLabel(version)}</strong>
        {target
          ? ` · changes against ${vLabel(target.versions.at(-1)!.version)}`
          : " · first version"}
      </p>

      {!target && (
        <TextField
          label="Test name"
          placeholder={h?.title ?? "What this test checks"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      )}

      <TextField
        multiline
        label={needsMessage ? "What changed and why" : "Description"}
        placeholder={
          needsMessage
            ? "What changed and why (required)"
            : "Description (optional)"
        }
        hint={
          needsMessage
            ? "Required. One or two lines, like a commit message."
            : "Optional for v1.0.0."
        }
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required={needsMessage}
        autoFocus={needsMessage}
      />

      <section aria-labelledby="save-changelog">
        <h3 id="save-changelog" className="lab-setup-heading">
          Changelog
        </h3>
        {lines.length ? (
          <pre className="lab-changelog">{lines.join("\n")}</pre>
        ) : (
          <p className="lab-muted lab-xs">
            No changes against the previous version.
          </p>
        )}
      </section>

      <section aria-labelledby="save-results">
        <h3 id="save-results" className="lab-setup-heading">
          Results at save
        </h3>
        <ResultsTable results={results} />
      </section>

      {h && (
        <label className="lab-check">
          <input
            type="checkbox"
            checked={pin}
            onChange={(e) => setPin(e.target.checked)}
          />{" "}
          Pin {h.id} to <code>{id}</code> {vLabel(version)}
        </label>
      )}

      <div className="lab-row lab-gap-2 lab-save-actions">
        <Btn onClick={onDone}>Cancel</Btn>
        <Btn type="submit" variant="primary" disabled={!canSave}>
          Save {vLabel(version)}
        </Btn>
      </div>
    </form>
  )
}

export function ResultsTable({ results }: { results: CheckResult[] }) {
  if (!results.length)
    return (
      <p className="lab-muted lab-xs">
        No checks were running. Turn on a check switch to record results.
      </p>
    )
  return (
    <table className="lab-results">
      <thead>
        <tr>
          <th scope="col">Check</th>
          <th scope="col">Frame</th>
          <th scope="col">Fail</th>
          <th scope="col">Warn</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={`${r.check}@${r.frame}`}>
            <td>
              <code>{r.check}</code>
            </td>
            <td>{r.frame}</td>
            <td className={r.fail ? "lab-fail" : ""}>{r.fail}</td>
            <td>{r.warn}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Decisions tab: version history ───────────────────────────────────────

export function VersionHistory({ testId }: { testId: string }) {
  const project = useLab((s) => s.project)
  const loaded = useLab((s) => s.ui.loadedTest)
  const test = findTest(project, testId)
  if (!test) return null
  const versions = [...test.versions].reverse()
  return (
    <ol className="lab-versions" aria-label={`${test.id} version history`}>
      {versions.map((v, i) => (
        <VersionEntry
          key={v.version}
          testId={test.id}
          v={v}
          open={i === 0}
          loaded={loaded?.test === test.id && loaded.version === v.version}
          author={personName(project, v.author)}
        />
      ))}
    </ol>
  )
}

function VersionEntry({
  testId,
  v,
  open,
  loaded,
  author,
}: {
  testId: string
  v: TestVersion
  open: boolean
  loaded: boolean
  author: string
}) {
  return (
    <li>
      <details open={open}>
        <summary>
          <code>{vLabel(v.version)}</code>
          <span className="lab-muted">
            {v.date} · {author}
            {v.iteration ? ` · ${v.iteration}` : ""}
          </span>
          {loaded && <span className="sr-only"> (loaded)</span>}
        </summary>
        <div className="lab-version-body">
          {v.message && <p>{v.message}</p>}
          <pre className="lab-changelog">{v.changelog.join("\n")}</pre>
          <ResultsTable results={v.results} />
          <button
            type="button"
            className="lab-link-btn"
            disabled={loaded}
            onClick={() => {
              store.loadTest({ test: testId, version: v.version })
              toast(`Loaded ${testId} ${vLabel(v.version)}`)
            }}
          >
            {loaded ? "Loaded" : `Load ${vLabel(v.version)}`}
          </button>
        </div>
      </details>
    </li>
  )
}
