# Dark Sky Map — MVP Build Plan

**Route:** `ericajaclyn.com/darkskymap`
**Type:** Portfolio sub-project — interactive US light-pollution map
**Doc version:** v0.4 (planning draft, pre-build)
**Status:** Decisions locked; awaiting Phase 0 execution
**v0.4 changelog:** Resolved A1 (validation acceptance rubric) and A4 (H3 hex for D3 overview); updated T0.4 and T4.2 acceptance criteria; added Falchi systematics (city-core overestimate, West/East atmosphere split) to Appendix A; closed open items #1–2.
**v0.3 changelog:** Locked Tier-1-first build order (D9); closed open item #4.
**v0.2 changelog:** Added Appendix A (sky-brightness model method spec); split T0.2 into tiered kernel tickets (T0.2a/T0.2b); named ground-truth dataset in T0.4; strengthened model-disclosure caveats in T5.2.

---

## 1. Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **Public-domain-only data.** No CC BY-NC anywhere in the stack. | Removes the "is a portfolio commercial?" question entirely instead of arguing it. |
| D2 | **Self-derive the sky-brightness layer** from public-domain VIIRS. No Falchi/Lorenz tiles, no permission-gating. | Fidelity/rigor over speed; the derived raster is Erica's own work from public input. |
| D3 | Sky-brightness layer labeled **"Sky Brightness (modeled from VIIRS)"** — not "World Atlas." | Honest; self-derived model is not the Falchi/Lorenz atlas. |
| D4 | **Elevation from a bundled CONUS DEM,** sampled locally. | Control, offline-capable, no per-click API dependency. |
| D5 | **Two views:** D3 national overview + MapLibre explorer, user-switchable. | Designed overview plays to design strengths; explorer gives detail. |
| D6 | **Base map:** Protomaps/PMTiles (vector, self-hosted CONUS extract) + USGS imagery (satellite). | Max control, fully open, themable to portfolio design system. |
| D7 | **Scope:** CONUS (lower 48) only for MVP. | Avoids reprojection/tiling overhead for AK/HI/territories. |
| D8 | **Serverless/static hosting** consistent with existing Astro→Vercel deploy; tiles/COG on Cloudflare R2. | No always-on GIS backend. |
| D9 | **Build Tier 1 (semi-empirical kernel) first;** Tier 2 (Garstang) is a post-validation fidelity upgrade. | Isolates pipeline-correctness from physics-correctness at the T0.4 gate; Tier 1 may suffice for MVP. |

---

## 2. Assumptions & constraints (flagged — correct if wrong)

- **A1 — RESOLVED (v0.4).** Validation is an acceptance *rubric*, not a single tolerance: **RMSE ≤ 0.25 mag/arcsec²** vs NPS CCD; **|mean signed bias| ≤ 0.10**; errors **stratified by brightness regime** (dark Bortle 1–3 vs urban) **and region** (arid West vs humid East); any **|error| > 0.5 mag** site flagged for inspection. Anchor: Falchi 2016's full EGM agreed with CCD to ~0.1 mag; ~0.15 mag is the SQM + spectral measurement floor — so 0.25 is honest for a Tier-1 kernel without chasing noise. Globe at Night used in aggregate only (individual obs SD ≈ 1.2 mag).
- **A2** — Latest VIIRS annual composite = **VNL V2.2, 2024** (2012–2024 available, 500 m).
- **A3** — "Bortle (offline)" reinterpreted as **"Bortle (bundled)"** — a low-res raster shipped as a static asset (web has no native "offline" the way an app does; PWA service-worker caching optional later).
- **A4 — RESOLVED (v0.4).** D3 overview uses an **equal-area hex grid (H3)**, not counties. Sky brightness is continuous and ignores administrative lines; county aggregation imports area-weight bias + MAUP into a fidelity-first project. Resolution tunable for the CONUS overview (~H3 res 4–5). A county "look up my area" view is a defensible v2 add, not MVP.
- **A5** — Portfolio site is **not** commercial in intent; regardless, D1 makes this moot.
- **A6** — This is a **planning artifact only.** No app code, repo, or Figma changes are implied by this doc.

---

## 3. Licensing register (clean stack — obligations, not risks)

Clean licenses still carry attribution duties. These are checklist items.

| Component | Source | License | Obligation |
|---|---|---|---|
| Nighttime lights | VIIRS VNL V2.2 / NASA Black Marble | Public domain / CC0 | Credit Earth Observation Group, Payne Institute, Colorado School of Mines |
| Vector base | Protomaps + OSM | PMTiles public domain; styles CC0; tiles ODbL Produced Work | Visible **© OpenStreetMap**; don't name a fork "Protomaps" |
| Satellite base | USGS / NAIP | Public domain (US gov) | Courtesy credit |
| Elevation | USGS 3DEP / SRTM | Public domain | Courtesy credit |
| Address search | US Census Geocoder | Public domain, keyless, US-only | Confirm terms at build; none material |
| Fonts/glyphs | Noto / Open Sans / similar | SIL OFL / Apache | Bundle license file |
| Libraries | MapLibre GL JS, D3, geotiff.js, pmtiles | BSD / ISC / MIT | Standard notices |

**Attribution block to display (draft copy):**
> Nighttime lights: VIIRS, Earth Observation Group, Payne Institute for Public Policy, Colorado School of Mines (public domain). Base map © OpenStreetMap contributors (ODbL), tiles via Protomaps. Satellite imagery: USGS (public domain). Elevation: USGS 3DEP (public domain). **Sky Brightness (modeled from VIIRS)** derived using published skyglow-propagation methods (Garstang; Cinzano & Falchi). Modeled estimate — not a direct measurement.

---

## 4. Architecture — one pipeline, staged outputs

VIIRS radiance (public domain) is processed once and emitted as **five artifacts**, each feeding a different feature:

```
VIIRS radiance (nW/cm²/sr, CONUS COG)
    │
    ├─▶ (a) VIIRS display tiles        → "VIIRS Nighttime" layer
    │
    ├─▶ skyglow propagation model
    │      → artificial zenith brightness (mcd/m²)
    │      → conversion chain → SQM / ratio / Bortle
    │           │
    │           ├─▶ (b) sky-brightness display tiles → "Sky Brightness" layer
    │           ├─▶ (c) coarse Bortle raster (bundled) → "Bortle (bundled)" layer
    │           ├─▶ (d) point-query COG → click-to-query stats panel
    │           └─▶ (e) county/hex aggregates (TopoJSON) → D3 overview
```

**Runtime:**
- **MapLibre GL JS** renders base + overlay tiles (WebGL slippy map).
- **D3** renders the national overview (Albers-USA choropleth) + supporting charts, on pre-reduced aggregates.
- **geotiff.js** reads single pixels from the COG via HTTP range requests — point query with no backend.
- **Bundled DEM** sampled client-side for elevation.
- All tiles/COG/DEM served static from **Cloudflare R2**; page from **Vercel**.

**Conversion chain (constants pinned — mind units):**
- Natural sky brightness = 22.00 mag/arcsec² = **0.171168465 mcd/m²**
- Total brightness = artificial + 0.171168465 mcd/m²
- **SQM (mag/arcsec²) = log₁₀(total_mcd_m² / 1.08×10⁸) / −0.4**
- Ratio = artificial / 0.171168465
- NELM (optional) = 7.93 − 5·log₁₀(10^(4.316 − SQM/5) + 1)
- Bortle = binned from SQM, **labeled approximate** (zenith ≠ whole-sky)

**Bortle binning (representative — finalize in T0.3, validate in T0.4):**

| Bortle | SQM (mag/arcsec²) |
|---|---|
| 1 | ≥ 21.99 |
| 2 | 21.89 – 21.99 |
| 3 | 21.69 – 21.89 |
| 4 | 20.49 – 21.69 |
| 5 | 19.50 – 20.49 |
| 6 | 18.94 – 19.50 |
| 7 | 18.38 – 18.94 |
| 8–9 | < 18.38 |

*Check: WV site SQM 21.82 → Bortle 3. Consistent.*

---

## 5. Backlog — epics, tickets, acceptance criteria

### EPIC 0 — Data pipeline & derivation *(the crux; blocks everything)*

- **T0.1 — Acquire & prep VIIRS.** Pull VNL V2.2 (2024) + Black Marble; clip to CONUS; reproject to EPSG:3857.
  *AC:* single-band CONUS COG in nW/cm²/sr; CRS, nodata, units documented; reproducible script.
- **T0.2a — Propagation model, Tier 1 (semi-empirical kernel).** Convolve VIIRS radiance with a published semi-empirical propagation law (Walker/Treanor/Garstang-law); fit amplitude + decay exponent to ground truth. See Appendix A. *Build this first — it stands up the full pipeline + validation harness.*
  *AC:* CONUS artificial-brightness raster (mcd/m²) produced via reproducible FFT convolution; kernel + fitted parameters documented; feeds T0.3–T0.5 end-to-end.
- **T0.2b — Propagation model, Tier 2 (Garstang 1986 kernel).** Swap in the analytical single+double-scattering kernel (Rayleigh + Mie, scale heights, path extinction, emission function G=0.15/F=0.15, fixed clear atmosphere, observer elevation from bundled DEM). Same convolution harness. See Appendix A.
  *AC:* kernel swap re-validated against T0.4; accuracy ≥ Tier 1; curvature-neglect limitation documented.
- **T0.3 — Conversion chain.** Implement artificial→total→SQM→ratio→Bortle; pin constants; unit-test against worked examples.
  *AC:* unit tests pass; formulas match documented source; Bortle bins finalized.
- **T0.4 — 🚦 VALIDATION GATE (GO/NO-GO).** Reproduce known sky-brightness measurements within tolerance (A1). Ground truth: **NPS Night Skies Program** CCD datasets (primary — public domain, US, Johnson-V-calibrated, the source Falchi used via Duriscoe); **Globe at Night** citizen SQM (secondary/coverage); WV site 37.914, −80.340 = 21.82 (anchor). Account for SQM ~20° FOV and ~0.1 mag precision. See Appendix A.
  *AC:* meets A1 rubric (RMSE ≤ 0.25, |bias| ≤ 0.10, stratified by regime + region, >0.5 mag outliers flagged) on the NPS CCD set. **If fail → escalate to Erica; documented Option B fallback (VIIRS + labeled approximate Bortle) is the only alternative. No UI work starts before this passes.**
- **T0.5 — Stage the five outputs.** Emit (a) VIIRS tiles, (b) sky-brightness tiles, (c) coarse Bortle raster, (d) point-query COG, (e) county/hex aggregates.
  *AC:* all five reproducible from one script; sizes within budget; uploaded to R2 with cache headers.

### EPIC 1 — Map foundation (MapLibre explorer)

- **T1.1 — Route + base map.** `/darkskymap` in Astro; mount MapLibre; Protomaps CONUS PMTiles from R2.
  *AC:* base renders; pan/zoom smooth; © OSM visible; first paint < budget.
- **T1.2 — Base-map switcher.** Standard (Protomaps, themed) / Satellite (USGS) / Hybrid (USGS + label layer).
  *AC:* switching works; correct attribution swaps per base.
- **T1.3 — Overlay controls.** Show-overlay toggle + opacity slider (0–100%) on the light-pollution layer.
  *AC:* toggles; opacity persists in view state; keyboard-operable slider.
- **T1.4 — Layer switcher.** Sky Brightness (modeled from VIIRS) [default] / VIIRS Nighttime / Bortle (bundled).
  *AC:* switching swaps tile source **and** legend **and** panel mode together.
- **T1.5 — Legend.** Dual-encoded (color + numeric value + text label); Bortle marked approximate.
  *AC:* legend reflects active layer; meaning never conveyed by color alone.

### EPIC 2 — Point query & stats panel

- **T2.1 — Pixel read.** Click/tap → read COG pixel via geotiff.js HTTP range request.
  *AC:* returns value at coordinate without full-file download; within latency budget.
- **T2.2 — Layer-dependent stats panel.** Sky-brightness active → coords, SQM, artificial brightness, ratio, Bortle-ref, elevation, NELM(opt). VIIRS active → radiance only. Bortle-bundled → class only.
  *AC:* panel content keyed to active layer; **SQM/Bortle never shown over raw VIIRS as if measured.**
- **T2.3 — Local elevation.** Sample bundled CONUS DEM at coordinate.
  *AC:* returns elevation (m + ft) with no network call; matches USGS within tolerance.
- **T2.4 — Panel accessibility.** Keyboard-reachable, focus-managed, SR-announced; all values as text.
  *AC:* passes keyboard + screen-reader walkthrough; WCAG 2.1 AA.

### EPIC 3 — Search & geolocation

- **T3.1 — Coordinate search.** Parse decimal / signed / `lat,lng` formats → fly + query.
  *AC:* parses common formats; validates CONUS bounds; clear error on out-of-bounds.
- **T3.2 — Address search.** US Census Geocoder → fly + query.
  *AC:* resolves US addresses; graceful no-result; keyless.
- **T3.3 — Near me.** Geolocation → query current position.
  *AC:* permission-gated; fallback if denied; reduced-motion respected on fly-to.

### EPIC 4 — D3 national overview (designed view)

- **T4.1 — View-mode switch.** Overview (D3) / Explore (MapLibre); shared state (active layer, selected point, opacity) via route/param.
  *AC:* mode persists; point selection carries across views.
- **T4.2 — Albers-USA hex map.** D3 `geoAlbersUsa` over an **equal-area H3 hex aggregation** (A4), colored by sky brightness; accessible palette + non-color encoding (labels/patterns).
  *AC:* renders CONUS; hex cells keyboard-navigable; SR summaries present; resolution tuned for payload vs detail.
- **T4.3 — Supporting D3.** SQM/Bortle distribution histogram + selected-point readout.
  *AC:* updates on selection; accessible.
- *(Deferred: SQM year-over-year trend — needs multi-year regression → v2.)*

### EPIC 5 — Polish, accessibility, performance, launch

- **T5.1 — WCAG 2.1 AA audit.** Contrast, focus order, reduced-motion (fly/zoom), non-color encodings, alt text.
  *AC:* passes Erica's accessibility-review bar.
- **T5.2 — Attribution & method page.** All credits (§3) + method write-up + validation results + explicit model-disclosure caveats (spectral mismatch VIIRS/SQM/Johnson V; fixed clear atmosphere; assumed uplight emission function; zenith-only) per Appendix A. "Modeled, not measured" stated prominently.
  *AC:* every obligation met; method transparent and reproducible; caveats visible, not buried.
- **T5.3 — Performance.** WebP tiles, lazy-load D3/geotiff, R2 cache headers, tile budget.
  *AC:* Lighthouse ≥ target; first map paint < budget.
- **T5.4 — Meta / nav / analytics.** OG card; `/darkskymap` in nav; privacy-respecting analytics.
  *AC:* nav integrated; OG renders; analytics live.
- **T5.5 — Launch.** Subpath launch (no DNS change needed).
  *AC:* live at `ericajaclyn.com/darkskymap`.

---

## 6. Sequencing & milestones

| Milestone | Contents | Gate |
|---|---|---|
| **M0** | Epic 0 — data spike | **T0.4 validation GO/NO-GO** |
| **M1** | Epic 1 — map + overlay + layer/base switchers | Base + overlay render |
| **M2** | Epic 2 — point query + panel + elevation + a11y | Query matches source within tolerance |
| **M3** | Epic 3 (search) + Epic 4 (D3 overview) | Both views usable |
| **M4** | Epic 5 — polish + launch | Live |

**Critical path:** Epic 0 → Epic 1 → Epic 2. Epics 3 & 4 partially parallel after M1. Epic 4 depends on T0.5(e).

---

## 7. Risks & kill-criteria

| ID | Risk | Mitigation | Owner |
|---|---|---|---|
| **R1** | Propagation model fails validation (T0.4). *Highest risk.* | Fall back to Option B (VIIRS + labeled approximate Bortle). | Erica |
| R2 | geotiff.js range-request latency hurts UX. | Value-encoded (Terrain-RGB-style) tiles, decoded client-side. | — |
| R3 | Bundled DEM bloats page weight. | Downsample/quantize DEM; or lazy-load DEM tiles. | — |
| R4 | CONUS PMTiles size / R2 egress. | CONUS extract only; WebP; cache; monitor. (Low at portfolio traffic.) | — |
| R5 | Heatmap fails color-blind users. | Numeric panel is the primary affordance; non-color legend encoding. | — |

---

## 8. Deferred to v2+

Moon calendar · galactic-core altitude / ephemeris · meteor showers · aurora forecast · Spots / dark-sky finder · crowdsourced SQM submissions · SQM year-over-year trend · Alaska / Hawaii / territories · full Falchi-grade radiative-transfer model · PWA offline caching · EOX Sentinel-2 alternate imagery (only if licensing vintage is confirmed public-domain-safe).

---

## 9. Open items before backlog execution

1. Set real validation tolerance (A1).
2. Choose county vs hex for D3 (A4).
3. Confirm doc version convention (v0.1 draft assumed).

---

## Appendix A — Sky-brightness model (T0.2) method spec

**Published spine — implement from these equations, not anyone's source code:**

| Ref | What to take |
|---|---|
| Garstang 1986, PASP 98, 364 | Foundational single + double scattering; Rayleigh (molecular) + Mie (aerosol); exponential scale heights; adjustable aerosol content; city emission function with ground-reflected fraction **G** and direct-uplight fraction **F** (standard **G=0.15, F=0.15**). |
| Cinzano, Falchi & Elvidge 2001, MNRAS 328, 689 | Propagation function f between point pairs → total brightness as a **convolution** of the radiance field with a distance-decay kernel. |
| Cinzano & Falchi 2012, MNRAS 427, 3337 | Extended Garstang Models (EGM/LPTRAN): multiple scattering, Earth curvature + screening, wavelength. **Tier 3 — out of MVP.** |
| Falchi et al. 2016, Sci. Adv. 2, e1600377 | VIIRS application + SQM/CCD calibration approach (the method — **not** the CC BY-NC raster). |

**Core structure (all tiers).** Zenith artificial brightness = convolution of the VIIRS upward-radiance field with a propagation kernel (contribution of a unit source vs distance). Compute once over CONUS via FFT. Kernel radius must be large — skyglow reaches ~100s of km — so process a frame padded well beyond CONUS to avoid edge loss.

**Tier 1 — semi-empirical kernel (MVP, build first).** Kernel = a published semi-empirical propagation law (Walker / Treanor / Berry / Garstang-law): contribution ∝ radiance × distance-decay. Fit amplitude + exponent to ground truth. An accepted approximation in the literature. Purpose: full pipeline + validation harness end-to-end, honestly, fast.

**Tier 2 — Garstang 1986 kernel (target).** Replace the kernel with the analytical single+double-scattering solution: Rayleigh + Mie scattering, exponential scale heights (molecular vs aerosol), extinction along path, emission function (G=0.15, F=0.15), single fixed standard clear atmosphere, observer elevation from the bundled DEM. Neglect Earth curvature (acceptable to mid-range — document as a limitation). Kernel is swappable behind the same convolution → low-risk upgrade.

**Tier 3 — EGM (out of MVP, v2 rigor path).** Multiple scattering, curvature/screening, wavelength dependence.

**Conversion tail (after propagation, per §4):** artificial (mcd/m²) → + 0.171168465 natural → total → SQM → ratio → Bortle.

**Model-disclosure caveats (must appear on the site — T5.2):**
- **Spectral mismatch:** VIIRS DNB bandpass ≠ SQM bandpass (~400–650 nm) ≠ Johnson V. Calibration is a broadband approximation (~0.1 mag order before modeling error).
- **Single fixed clear atmosphere;** real skyglow varies with aerosol, humidity, season.
- **Assumed uplight emission function** (G/F); real per-city uplight varies.
- **Zenith only** — not whole-sky, not horizon (same reason Bortle is labeled approximate).

**Ground truth (T0.4):**
- **Primary — NPS Night Skies Program** CCD datasets: public domain, US, Johnson-V-calibrated (Duriscoe 2007, PASP); the same source used to calibrate Falchi 2016. Interactive site map + per-site metrics.
- **Secondary — Globe at Night** citizen SQM/NELM (coverage, noisier).
- **Anchor —** WV site (37.914, −80.340 = 21.82 → Bortle 3).
- Account for SQM ~20° FOV and ~0.1 mag absolute precision when comparing to a zenith point model.
