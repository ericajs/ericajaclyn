import {
  AiChat02Icon,
  HelpCircleIcon,
  Moon02Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
  Sun01Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"
import { useState } from "react"
import { BASE_PROJECTS, store, useLab } from "../store/store"
import type { Mode } from "../types"
import { toast } from "./bus"
import { buildHandoff, digest, download, importHandoff } from "../store/handoff"
import {
  Btn,
  Dialog,
  Icon,
  IconButton,
  Segmented,
  TextField,
} from "./primitives"
import { copy } from "./util"
import { SavedMenu } from "./SavedTests"

const MODES: { value: Mode; label: string; title: string }[] = [
  {
    value: "review",
    label: "Review",
    title: "One target at an exact viewport (1)",
  },
  {
    value: "compare",
    label: "Compare",
    title: "This build against production (2)",
  },
  {
    value: "flow",
    label: "Flow",
    title: "Storyboard and run an interaction flow (3)",
  },
  {
    value: "matrix",
    label: "Matrix",
    title: "Permutations and batch tests (4)",
  },
  { value: "roadmap", label: "Roadmap", title: "Iterations and lifecycle (5)" },
]

export function Header({ onHelp }: { onHelp: () => void }) {
  const project = useLab((s) => s.project)
  const ui = useLab((s) => s.ui)
  useLab((s) => s.overlay)
  const unsent = store.dirtyCount()
  const [handoff, setHandoff] = useState(false)
  const [people, setPeople] = useState(false)
  const me = store.me()
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  )

  return (
    <header className="lab-header">
      <IconButton
        icon={SidebarLeftIcon}
        label="Toggle questions panel"
        shortcut="["
        pressed={ui.leftOpen}
        onClick={() => store.setUI({ leftOpen: !ui.leftOpen })}
      />
      <div className="lab-brand">
        <span className="lab-brand-mark" aria-hidden="true">
          ◐
        </span>
        <span className="sr-only">AI Design Lab: </span>
        {BASE_PROJECTS.length > 1 ? (
          <select
            aria-label="Project"
            data-tip="Project under review"
            value={project.id}
            onChange={(e) => store.switchProject(e.target.value)}
          >
            {BASE_PROJECTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="lab-strong">{project.name}</span>
        )}
      </div>
      <nav aria-label="Mode">
        <Segmented
          label="Mode"
          value={ui.rig.mode}
          onChange={(m) => store.setMode(m)}
          options={MODES}
        />
      </nav>
      <div className="lab-row lab-gap-2 lab-push">
        <SavedMenu />
        <label
          className="lab-check"
          title="Hide Claude's recommendation until you've recorded your own decision — avoids anchoring"
        >
          <input
            type="checkbox"
            checked={ui.blind}
            onChange={(e) => store.setUI({ blind: e.target.checked })}
          />{" "}
          Blind review
        </label>
        <Btn
          variant={unsent ? "primary" : "outline"}
          onClick={() => setHandoff(true)}
        >
          <Icon icon={AiChat02Icon} /> Hand off to Claude
          {unsent ? ` (${unsent})` : ""}
        </Btn>
        <button
          type="button"
          className="lab-people-btn"
          onClick={() => setPeople(true)}
          aria-label={`People and invites. You are ${me.name}.`}
        >
          {project.people.slice(0, 4).map((p) => (
            <span
              key={p.id}
              className={`lab-avatar role-${p.role}`}
              aria-hidden="true"
              title={`${p.name} (${p.role})`}
            >
              {p.role === "claude" ? "✳" : p.name.slice(0, 1)}
            </span>
          ))}
          <Icon icon={UserAdd01Icon} />
        </button>
        <IconButton
          icon={dark ? Sun01Icon : Moon02Icon}
          label={dark ? "Light lab theme" : "Dark lab theme"}
          onClick={() => {
            const next = !dark
            document.documentElement.classList.toggle("dark", next)
            try {
              localStorage.setItem("lab-theme", next ? "dark" : "light")
            } catch {
              /* ignore */
            }
            setDark(next)
          }}
        />
        <IconButton
          icon={HelpCircleIcon}
          label="Shortcuts and how it works"
          shortcut="?"
          onClick={onHelp}
        />
        <IconButton
          icon={SidebarRightIcon}
          label="Toggle review panel"
          shortcut="]"
          pressed={ui.rightOpen}
          onClick={() => store.setUI({ rightOpen: !ui.rightOpen })}
        />
      </div>
      <HandoffDialog open={handoff} onClose={() => setHandoff(false)} />
      <PeopleDialog open={people} onClose={() => setPeople(false)} />
    </header>
  )
}

function HandoffDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const project = useLab((s) => s.project)
  useLab((s) => s.overlay)
  const [images, setImages] = useState(true)
  const [all, setAll] = useState(false)
  const [result, setResult] = useState("")
  const unsent = store.dirtyCount()
  const lastHandoff = store.state.overlay.lastHandoff
  const stamp = () =>
    new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")

  return (
    <Dialog open={open} onClose={onClose} title="Hand off to Claude">
      <p>
        {unsent} unsent change{unsent === 1 ? "" : "s"}
        {lastHandoff
          ? ` since your last handoff (${new Date(lastHandoff).toLocaleString()})`
          : ""}
        . Paste the digest into a Claude session for this repo, or attach the
        file. Claude merges it into{" "}
        <code>src/lab/projects/{project.id}.json</code>, answers everything you
        marked “Ask Claude”, and the next preview build shows the replies.
      </p>
      <div className="lab-row lab-gap-2 lab-wrap">
        <label className="lab-check">
          <input
            type="checkbox"
            checked={images}
            onChange={(e) => setImages(e.target.checked)}
          />{" "}
          Include screenshots in the file
        </label>
        <label className="lab-check">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />{" "}
          Everything local, not just unsent
        </label>
      </div>
      <div className="lab-row lab-gap-2 lab-wrap">
        <Btn
          variant="primary"
          disabled={!unsent && !all}
          onClick={async () => {
            const file = await buildHandoff({ all, images: false })
            const ok = await copy(digest(file, project))
            setResult(
              ok
                ? "Digest copied. Paste it into Claude."
                : "Clipboard blocked — use Download instead."
            )
            if (ok) store.markHandedOff()
          }}
        >
          Copy digest for Claude
        </Btn>
        <Btn
          disabled={!unsent && !all}
          onClick={async () => {
            const file = await buildHandoff({ all, images })
            download(
              `lab-handoff-${project.id}-${stamp()}.json`,
              JSON.stringify(file, null, 1)
            )
            store.markHandedOff()
            setResult("Handoff file downloaded.")
          }}
        >
          Download handoff file
        </Btn>
      </div>
      {result && (
        <p role="status" className="lab-xs">
          {result}
        </p>
      )}
      <hr />
      <h3 className="brow">Import a contributor&apos;s review</h3>
      <p className="lab-xs lab-muted">
        Contributors send you their handoff file; importing it queues their
        comments and annotations for your next handoff to Claude.
      </p>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Import handoff file"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const r = await importHandoff(await f.text())
          setResult(r.error ?? `Imported ${r.count} item(s).`)
          toast(r.error ?? `Imported ${r.count} item(s)`)
        }}
      />
      <hr />
      <button
        type="button"
        className="lab-link-btn lab-danger"
        onClick={() => {
          if (
            confirm(
              "Discard everything stored in this browser for this project? The repo file is untouched."
            )
          ) {
            store.discardLocal()
            setResult("Local changes discarded.")
          }
        }}
      >
        Discard local changes
      </button>
    </Dialog>
  )
}

function PeopleDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const project = useLab((s) => s.project)
  const identity = useLab((s) => s.ui.identity)
  const [name, setName] = useState("")
  const [link, setLink] = useState("")
  return (
    <Dialog open={open} onClose={onClose} title="People">
      <ul className="lab-people">
        {project.people.map((p) => (
          <li key={p.id}>
            <span className={`lab-avatar role-${p.role}`} aria-hidden="true">
              {p.role === "claude" ? "✳" : p.name.slice(0, 1)}
            </span>
            <span>
              <strong>{p.name}</strong>{" "}
              <span className="lab-muted lab-xs">{p.role}</span>
              {p.invite && (
                <span className="lab-muted lab-xs">
                  {" "}
                  · invited {new Date(p.invite.createdAt).toLocaleDateString()}
                  {p.invite.acceptedAt ? " · joined" : ""}
                </span>
              )}
            </span>
            {p.role !== "claude" && (
              <button
                type="button"
                className="lab-link-btn lab-push"
                aria-pressed={identity === p.id}
                onClick={() => store.setIdentity(p.id)}
              >
                {identity === p.id ? "You" : "Act as"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="lab-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          const r = store.inviteLink(name.trim())
          setLink(r.link)
          copy(r.link).then((ok) =>
            toast(ok ? "Invite link copied" : "Invite created")
          )
          setName("")
        }}
      >
        <p className="lab-field-label">Invite an external contributor</p>
        <div className="lab-row lab-gap-2 lab-align-start">
          <TextField
            label="Name"
            placeholder="Contributor's name"
            hint="They review in their own browser and send you a handoff file to import."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Btn type="submit" variant="primary">
            Create invite
          </Btn>
        </div>
        {link && (
          <TextField
            label="Invite link"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </form>
      <p className="lab-xs lab-muted">
        Invites decide who&apos;s who in threads — they are not access control.
        Who can open the lab at all is controlled by Vercel Deployment
        Protection on preview deployments (the lab is not built for production).
        Live multi-user sync needs a backend; see the lab README.
      </p>
    </Dialog>
  )
}
