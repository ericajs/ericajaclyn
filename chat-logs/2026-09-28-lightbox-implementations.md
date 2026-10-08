---
type: chat-log
date: 2026-09-28
topics:
  - lightbox
  - astrophotography
  - case-studies
  - component-architecture
project: portfolio-build/ericajaclyn
---

# Lightbox image viewer — current implementation

The lightbox image viewer is implemented **twice as independent per-template copies**, not a shared component. Line numbers are point-in-time (2026-09-27) — verify against current code.

## Astrophotography — `src/pages/astrophotography.astro` (markup 572–614, styles 617–650, script 652–729)
- **Trigger model — explicit authored buttons.** Each gallery/hero/composite image is wrapped at build time in `<button class="lightbox-trigger">` carrying `data-src`, `data-alt`, `data-title`, `data-subtitle` (e.g. filter formula). `cursor-zoom-in`, aria-label like "View {name} — {formula} full screen". Script collects via `querySelectorAll(".lightbox-trigger")`.
- **Overlay:** single `#lightbox` div, `role="dialog"`, `aria-modal="true"`, `aria-label="Image viewer"`, `fixed inset-0 z-50`, starts `hidden`, backdrop `bg-white/80 dark:bg-black/80 backdrop-blur-md`. Three circular controls (close top-right, prev/next mid-sides), `size-11`, `bg-foreground/10 hover:bg-foreground/20`, `transition-colors`, focus-visible rings, SVG icons. `<figure>` holds `#lightbox-img` (`max-h-[80vh] object-contain`) **plus `<figcaption>`** with `#lightbox-title` + `#lightbox-subtitle`.
- **Behavior:** `render(idx)` reads src/alt/title/subtitle from dataset (subtitle hidden when empty); `open(idx)` saves lastFocus, toggles `.is-open`/removes `hidden`, locks scroll (`documentElement.style.overflow="hidden"`), binds keydown, focuses close; `close()` reverses + restores focus; `step(±1)` wraps modulo. Keyboard: Esc closes, Arrow Left/Right navigate, Tab cycles the 3 controls (manual focus trap). Backdrop click (overlay/FIGURE/FIGCAPTION) closes.
- **Transition: none** — `.lightbox.is-open { display: block }` hard toggle, no fade/scale, instant image swaps. See `project_astro_lightbox_motion`: approved Figma spec §12.3 mandates the instant toggle, so adding motion needs Erica's sign-off.

## Case studies — `src/pages/uxdesign/[id].astro` (dynamic route; markup 241–279, styles 308–323, script 326–409)
Same overlay markup/IDs, dialog a11y, backdrop, three controls, open/close/step/keydown, scroll-lock, focus save/restore, focus trap, backdrop-click-close, and same instant `display` toggle (no transition).

Differences from astro page:
1. **Runtime/progressive-enhancement trigger model**, not authored — script selects every `img` in the `data-lightbox-scope` wrapper (line 92), then dynamically wraps each in a generated `<button>` (`createElement` → `insertBefore` → `appendChild`). Every body image auto-becomes zoom-to-open.
2. **No caption** — `<figure>` has only `#lightbox-img`; `render()` sets only src/alt.
3. **Image sizing:** case study `max-w-full max-h-full`; astro `max-h-[80vh]`.
4. **Source resolution:** case study reads `img.currentSrc || img.src` (respects responsive `srcset`); astro reads authored `data-src`.
5. `.lightbox-trigger` styled in CSS here (buttons generated), vs Tailwind classes on authored buttons in astro.

**Net / how to apply:** functionally equivalent viewers with matched a11y and motion — astro is caption-rich + data-attribute-driven; case-study is caption-less + auto-wraps body images. Candidate for extraction into one shared component if they should stay in lockstep. Related: `project_portfolio_strategy`.
