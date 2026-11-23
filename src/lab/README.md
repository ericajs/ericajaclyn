# Design Lab

A private review tool at `/lab` for testing design hypotheses against the real
site: accessibility and UX-heuristic switches, annotations and diagrams,
property specs, compare against production, flows, component permutations,
and a decision lifecycle with Claude in the loop.

It is built into `astro dev` and Vercel **preview** deployments only. Production
builds (`VERCEL_ENV=production`) contain no lab routes, no axe-core and no
sitemap entries. Force it on or off with `LAB=1` / `LAB=0`.

```bash
pnpm dev            # → http://localhost:4321/lab
node scripts/lab.mjs links --base https://<preview>.vercel.app   # every hypothesis's test link
node scripts/lab.mjs check                                     # validate the project file
node scripts/lab.mjs merge lab-handoff-portfolio-….json        # merge a review handoff
node scripts/lab.mjs digest                                    # where we are
```

## Layout

| Area | What it holds |
| --- | --- |
| Header | Project, **mode** (Review · Compare · Flow · Matrix · Roadmap), blind review, hand off to Claude, people |
| Left rail | Every question grouped by lifecycle stage, with decision, open-annotation and waiting-on-Claude flags |
| Test rig | Target, viewport, zoom, tools (Interact · Inspect · Pin · Box · Arrow · Label · Measure), active switches |
| Canvas | The design at an exact CSS viewport, overlays, inspector, findings drawer |
| Right panel | **Decisions** (hypothesis, criteria, test setup, Claude's recommendation, your decision, evidence, discussion) · **Notes** (screenshots with area marking) · **Improve** (design-system and lab improvements) |

Keyboard: `1–5` modes · `V I P B A T M` tools · `J/K` next/previous question ·
`[` `]` `\` panels and focus mode · `F` findings · `?` help.

## The loop

1. **Claude writes hypotheses** into `src/lab/projects/<id>.json`, each with a
   falsifiable statement, success criteria, a test setup (the link) and a
   recommendation that says what was measured.
2. **You open a question** — its test loads exactly; the URL reproduces it.
   Add or remove switches; chips show deviations from the preset.
3. **Record evidence and a decision.** Findings, flow runs, observations and
   screenshots attach to the hypothesis with the rig that produced them.
4. **Hand off to Claude**: copy the digest into a Claude session (or attach the
   file). Claude merges it, answers what you flagged, updates stages and
   iterations, and the next preview shows the replies.

Stages: idea → tentative → testing → validated (right thing: evidence of user
need) → verified (built right: spec, WCAG, production parity) → confirmed
(decided, assigned to a version). Plus rejected and parked.

## Switches

`src/lab/registry/switches.json` is the catalog; behavior is in
`engine/switches.ts` (simulate) and `engine/analyze.ts` (analyze). Three kinds:

- **simulate** changes what you see — color vision (Machado 2009, linear RGB),
  low acuity, glare, text spacing (1.4.12), root text size, pseudo-localization,
  images off, forced reduced motion, keyboard only, outlines, squint, grayscale,
  theme, RTL.
- **analyze** measures and overlays — text contrast (WCAG 2 ratio, APCA as a
  second opinion), axe-core, headings, landmarks, alt text, accessible names,
  target size (2.5.8 / 2.5.5), tab order, focus tracker, reflow & clipping,
  reading level, media-feature support, grid, fold lines.
- **guide** is for what a page cannot emulate — forced colors, user preference
  media queries, a screen-reader pass, Nielsen's heuristics with severity
  ratings. Each has exact steps and logs observations as evidence.

Zoom is real zoom: the CSS viewport is width ÷ zoom (1280 @ 400% = 320 CSS px).

Project **design toggles** (`toggles` in the project file) are switches for
candidate decisions: token values per theme (`vars` / `varsDark`) or raw CSS.

## Adding things

- **A page**: add a `route` target to the project file.
- **A component**: add it to `registry/components.meta.ts` (axes) and
  `registry/components.ts` (the import). Every permutation is pre-rendered at
  `/lab/frame/<id>/<slug>`.
- **A candidate screen**: create `src/lab/designs/<name>.astro`; it is served at
  `/lab/designs/<name>` and can be added as a route target.
- **A project**: add `src/lab/projects/<id>.json`; the header shows a switcher.

## Production compare

`/_prod/*` proxies the live site (`vercel.json` on previews, Vite proxy in dev;
override the dev target with `LAB_PROD_ORIGIN`). The lab fetches production HTML
through it and renders it with `srcdoc`, which shares this origin — so DOM
switches and checks apply to production exactly as to this build. If the proxy
is unavailable, production loads cross-origin and the rig says which switches
can't reach it. Limitation: root-relative `url()` inside production CSS files
resolves against the preview origin.

## Collaboration — what it is and isn't

- **Storage is local-first**: the project file is the base, and your edits are
  an overlay in localStorage (screenshots in IndexedDB), merged by id and
  `updatedAt`. Nothing leaves the browser until you hand off.
- **Claude is a participant by default**: "Ask Claude" is on for every comment,
  and flagged threads lead the handoff digest.
- **Invites set identity, not access.** An invite link carries the
  contributor's name; they review in their own browser and send you a handoff
  file to import. Who can open the lab at all is decided by **Vercel Deployment
  Protection** on preview deployments. Real-time multi-user sync and enforced
  roles need a backend (see the "Live multi-user sync" improvement in the
  Improve tab).
