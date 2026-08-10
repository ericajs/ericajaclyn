# Design-to-Code Naming & Accessibility Conventions

A convention reference for naming Figma layers, components, properties, and tokens
so they map cleanly to this codebase — and a **separate** statement of what WCAG
actually governs, so the two are never conflated.

> **The one rule that generates all the others:** name to the API contract, not to
> appearance. Where a name crosses into code, Figma conforms to code's vocabulary.
> Code is the source of truth for the *component contract*; design is the source of
> truth for *tokens*.

---

## ⚠️ Read this first: two different things

This document deliberately keeps two concerns in separate columns because they are
routinely — and incorrectly — merged:

| | **Design-file naming** | **Accessibility conformance** |
|---|---|---|
| What it is | How you name layers, components, properties, variables in Figma | Whether the shipped product is perceivable/operable/understandable/robust |
| Governed by | Convention + tool docs (Figma, DTCG) + team agreement | **WCAG 2.2** (W3C Recommendation), ARIA APG |
| Is there a formal standard? | **No** — no ISO/W3C standard governs Figma layer names | **Yes** — WCAG 2.2 success criteria, normatively worded |
| Where it's tested | Nowhere automated; it's a maintainability/handoff concern | On the **rendered, running build** with assistive tech |
| Does naming a layer satisfy WCAG? | **No.** A layer named `Button` conforms to nothing. | A coded `<button>` with an accessible name/role/state does. |

**Naming discipline is an *enabler* of accessible output, not a conformance target.**
Good semantic names raise the odds a developer builds the right semantic HTML — but
the success criterion is always met (or failed) by the markup, never by the design file.

---

## Part 1 — Design-file naming (convention)

Ranked by how much each name actually matters to code.

### 1.1 Components → PascalCase, exact match to the coded component

This repo's real component (`src/components/ui/button.tsx`) exports `Button`. The Figma
component should be named **`Button`** — not `Btn`, not `Button/Primary` (variants handle
that; see 1.2).

### 1.2 Component Properties → a 1:1 mirror of the code props

This is the load-bearing surface. The real `Button` API:

```ts
variant: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
size:    "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
asChild: boolean
```

The Figma component properties should therefore be:

| Figma construct | Maps to code | Naming rule (against *this* Button) |
|---|---|---|
| Variant property `variant` | `variant` prop | values **exactly** `default`, `outline`, `secondary`, `ghost`, `destructive`, `link` |
| Variant property `size` | `size` prop | values **exactly** `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg` |
| Instance-swap `icon` + position | `data-icon="inline-start" \| "inline-end"` slots | name the slot to the DOM data-attribute intent |
| Boolean `disabled` | native `disabled` attribute | match the HTML attribute |

**The single highest-leverage rule:** variant *values* must match the code's literal
types **character-for-character**. Use `sm`, not `Small`; `default`, not `Default`.
Casing mismatch on enum values is the #1 cause of broken codegen and messy Code Connect
mappings.

Casing for property *names* follows the code convention (React → camelCase props;
this Button also mirrors them onto `data-variant` / `data-size` attributes).

### 1.3 Structural / slot layers → semantic role names

Inside a component, name layers to their role: `label`, `icon`, `leadingIcon`,
`container`, `content`. Never ship `Text`, `Rectangle 4`, `Group 12` as meaningful
slots. These are what a developer (or a Code Connect template) maps to named children.

### 1.4 Variables & tokens → hierarchical, semantic, pipeline-matched

**Industry format standard:** the [DTCG format](https://www.designtokens.org/tr/drafts/format/)
defines a token as a name + `$value` (+ `$type`). Its naming constraints:

- Names **cannot start with `$`** (reserved for spec properties)
- Names **cannot contain** `{`, `}`, or `.` (used by the reference syntax)
- Names are **case-sensitive** (tools may flag case-only collisions)
- Groups nest hierarchically; aliases reference other tokens as `{group.token}`

**This repo's actual pipeline** is *not* DTCG JSON — it's CSS custom properties bound to
Figma Variables, surfaced through Tailwind v4's `@theme` (`src/styles/global.css`, whose
header comment names the Figma Design page as source of truth). The naming lesson still
applies: keep a **tiered** taxonomy and let Figma Variable groups map to the CSS custom
property names.

Recommended tiers (aspirational — the repo is currently mostly flat-semantic):

- **Primitive / global:** `color/blue/600`, `space/4`, `radius/md`
- **Semantic / alias:** `color/bg/primary`, `color/text/muted`, `color/border/default`
  → today's `--primary`, `--muted-foreground`, `--border`
- **Component-scoped (optional):** `button/bg/hover`

Rule: components reference *semantic* tokens; semantic tokens reference *primitives*.
A component should never reach straight to a primitive.

### 1.5 Everything else → don't over-engineer

Decorative frames and auto-layout wrappers are invisible to code. Give them legible
names for *your own* maintainability, but they carry no contract.

### 1.6 What never to do

- Encode appearance in names — `Blue Button`, `16px Text`. Style lives in tokens/variants.
- Invent a Figma-only vocabulary that diverges from the code's prop names.
- Use `Small/Medium/Large` when the type says `sm/md/lg`.
- Let a semantic component hardcode a primitive token.

### 1.7 The formal binding: Code Connect

[Figma Code Connect](https://developers.figma.com/docs/code-connect/) is what makes the
above *enforceable* instead of tribal. It links a Figma component to the real code
component; property mappings are declared **explicitly** via helpers
(`getEnum` / `getBoolean` / `getString` / instance mapping) rather than by automatic
name-matching. Matching your names and values to code (Part 1.2) is what keeps those
mappings trivial to write and stable over time.

---

## Part 2 — Accessibility conformance (WCAG 2.2, tested on the build)

These are the **normative** requirements. They apply to the rendered product, verified
with assistive technology — not to the Figma file. Levels and wording below were pulled
from the W3C Understanding documents (see Sources).

### 2.1 The criteria most relevant to components & design systems

| SC | Title | Level | What it requires (verbatim normative text) |
|---|---|---|---|
| **1.3.1** | Info and Relationships | A | "Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text." |
| **4.1.2** | Name, Role, Value | A | "For all user interface components … the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set; and notification of changes to these items is available to user agents, including assistive technologies." |
| **2.4.7** | Focus Visible | AA | "Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible." |
| **1.4.11** | Non-text Contrast | AA | UI components and their states must have "a contrast ratio of at least 3:1 against adjacent color(s)." Focus/state indicators are explicitly in scope. |
| **2.5.8** | Target Size (Minimum) | AA | "The size of the target for pointer inputs is at least 24 by 24 CSS pixels," barring listed exceptions (spacing, inline, essential, etc.). |
| **2.4.13** | Focus Appearance | AAA | Focus indicator area ≥ a 2px-thick perimeter of the component, **and** ≥ 3:1 contrast between focused/unfocused states of the same pixels. |

> Correction worth noting: Focus Appearance is **2.4.13 (AAA)** in WCAG 2.2. (2.4.11 is
> "Focus Not Obscured (Minimum)," a different AA criterion.) Cite the number, not memory.

### 2.2 How the design file *feeds* these (the honest linkage)

- A Figma variant property named `state` or a layer named `label` does **not** satisfy
  4.1.2. It merely makes it likely the dev wires the accessible **name/role/state** onto
  the coded control, which is what 4.1.2 tests.
- 1.3.1 is satisfied by semantic markup (`<button>`, heading levels, `<label for>`), not
  by a tidy Figma layer tree — though the tidy tree makes the right markup obvious.
- The tokens you name in Part 1.4 are where contrast (1.4.11, and text-contrast 1.4.3 AA)
  is actually *engineered*. Naming a token `color/border/default` doesn't pass contrast;
  its **value** relative to its background does.

### 2.3 ARIA button pattern (for reference)

Per the [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/button/):
role `button`; accessible name derived from text content (or `aria-label` /
`aria-labelledby`); `aria-pressed` for toggle buttons (label must **not** change with
state); `aria-disabled` when unavailable. A native `<button>` — which this repo's
`Button` renders by default — gets role and name-from-content for free.

---

## Part 3 — This repo, checked against the conventions

Findings from `src/components/ui/button.tsx` and `src/styles/global.css`:

- ✅ `Button` uses `class-variance-authority` with clean enum variants — a textbook
  contract to mirror in Figma variant properties (Part 1.2).
- ✅ Emits `data-slot="button"`, `data-variant`, `data-size` — stable hooks a Code
  Connect template can target.
- ✅ Renders a native `<button>` by default (via Radix `Slot` only when `asChild`) — so
  role + accessible-name-from-content come for free (Part 2.3, SC 4.1.2).
- ✅ Tokens are bound to Figma Variables (design-led source of truth) and surfaced via
  Tailwind `@theme`.
- ✅ **Focus styling unified — resolved.** `Button` previously focused with
  `focus-visible:border-ring` + `ring-[3px] ring-ring/50` (semi-transparent **gray**),
  while form inputs focus with the opaque **blue** `--input-ring` shipped in
  `global.css`. Measured contrast (relative-luminance formula, WCAG 1.4.11):
  the gray `ring-ring/50` came out to **1.94:1 in light mode** (fails the 3:1
  minimum) and **4.84:1 in dark mode** (passes) — the asymmetry the original
  finding warned not to assume away. The opaque blue `--input-ring` measures
  **5.17:1 light / 5.25:1 dark**, passing comfortably in both themes. `Button`
  now uses `focus-visible:border-[var(--input-ring)]` +
  `focus-visible:ring-[3px] focus-visible:ring-[var(--input-ring)]`, matching
  the input standard. (`aria-invalid`/destructive focus states are unchanged —
  out of scope for this pass.)

---

## Sources

All accessibility text is from the W3C WCAG 2.2 *Understanding* documents (a W3C
Recommendation); tooling from vendor/community specs. Fetched July 2026.

- [WCAG 2.2 — 1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)
- [WCAG 2.2 — 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
- [WCAG 2.2 — 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [WCAG 2.2 — 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [WCAG 2.2 — 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WCAG 2.2 — 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [ARIA Authoring Practices Guide — Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
- [Design Tokens Community Group — Format spec](https://www.designtokens.org/tr/drafts/format/)
- [Figma Code Connect docs](https://developers.figma.com/docs/code-connect/)

**Honesty note on provenance:** Part 1 (naming) is convention synthesized from the Figma
and DTCG docs above plus general React/TS practice; the "name to the API contract"
framing and the DDD "ubiquitous language" analogy are the author's, not a citable
standard. Part 2 (WCAG) is normatively sourced and quoted from the linked W3C documents.
