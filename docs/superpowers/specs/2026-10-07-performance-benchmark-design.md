# Reproducible performance benchmark — design

**Status:** draft for review · **Date:** 2026-10-07 · **Authors:** John Guerra (with Claude), reviewed by an independent InfoVis-reviewer agent

## 1. Goal

Produce performance numbers for the TimeWidget paper (IEEE VIS / CHI audience)
that support the claim **"TimeWidget scales up very well"**, measured by a method
that a co-author can re-run on any machine and OS with one command, and that a
reviewer would accept. The previous submission's reviewers were not convinced by
how performance was measured; the manual numbers in `rendimiento_TimeWidget.xlsx`
are being replaced, not extended.

### The claim, made falsifiable

"Scales well" is reported as three checkable statements, each per machine:

1. **Linear cost with a small constant.** Frame time grows linearly in total
   points; report slope (ms per 100k points) and R². Any renderer that draws
   every series is Ω(N), so linear-with-low-overhead is the defensible target.
2. **Interactive up to N.** The largest number of series whose **p95** frame
   time stays ≤ 16.7 ms (N₆₀), ≤ 33.3 ms (N₃₀) and ≤ 100 ms (N₁₀₀).
3. **Better than the obvious alternatives.** The same workload on naive Canvas,
   naive SVG and Vega-Lite (§5).

Not claimed: sub-linear query cost. `brushFilter` scans every series per frame
(`src/BrushInteraction.js:348`); the BVH accelerates the per-series
segment/box test, not the scan. The paper must not imply otherwise.

## 2. Evidence this design rests on

From a throwaway spike on an M4 Max, macOS, Chrome 154, headed Playwright,
3 fresh launches per cell (built-in 120 Hz ProMotion vs. external 60 Hz Dell):

| Lines | FPS vsync on (120 Hz / 60 Hz) | FPS vsync off (120 Hz / 60 Hz) | frame p50 off | JS p50 |
|---|---|---|---|---|
| 1k  | 121.6 / 60.7 | 1249 / 1257 | 0.70 ms | 1.0 ms |
| 15k | 76.7 / 60.3  | 78.9 / 79.7 | 12.5 ms | 11.1 ms |
| 30k | 36.9 / 38.2  | 39.3 / 38.6 | 25.5 ms | 23.6 ms |

- **The current FPS metric measures the monitor.** Same machine and build, 2×
  difference between screens; at 15k lines the 60 Hz screen reports 60 while the
  widget sustains ~79.
- **Vsync-off frame time is monitor-independent** (screens agree within ~3%) and
  **not quantised** to refresh periods (12.5 and 25.5 ms fall between them).
- **It still captures rasterisation cost that JS timers miss.** With software
  raster (`--disable-gpu`) at 20k lines: frame p50 70.6 ms vs JS p50 14.8 ms,
  identical with vsync on or off.
- **Default Playwright headless uses `chromium_headless_shell` with SwiftShader
  software canvas** (reviewer, verified): 14 FPS vs 60 headed at 20k lines with
  identical JS time. A backgrounded tab drops 60 → 35 FPS while still reporting
  `visibilityState === "visible"`. These are the most likely causes of the
  co-author's "AI got much lower FPS" observation.
- `RenderMs` measures **issuing** `context.stroke(Path2D)` commands, not
  rasterisation: it is ~5–6 ms at 20k lines under both GPU and software raster.
- `performance.now()` is coarsened to 100 µs (page is not cross-origin isolated);
  sub-millisecond collision timings are only ~±15% precise.

## 3. Scope

**In:** an `npm run bench` command; a common in-page driver; four implementation
adapters; environment gate and metadata; CSV/JSON output matching the
spreadsheet columns; a headless smoke test in the e2e suite; unit tests for the
statistics; a short `bench/README.md` for co-authors.

**Out (non-goals):** CI execution of the benchmark (numbers from shared CI
runners are meaningless); plotting (results are analysed separately); Firefox and
WebKit as primary targets (optional ecological check only); fixing
`ts.performance.run()`'s missing frame samples (separate issue).

## 4. Metrics

| Role | Metric | Source |
|---|---|---|
| **Headline** | Frame time p50 / p95 / p99 / mean, vsync off | common driver, all implementations |
| Derived | FPS = 1000 / frame time; N₆₀, N₃₀, N₁₀₀ (p95 crossings, log-interpolated); linear slope + R² | analysis |
| Supporting (TimeWidget only) | CollisionMs, RenderMs (reported as "canvas command time"), TotalCpuMs — p50/p95/p99/mean | existing `PerformanceMonitor` |
| Supporting | Load time (data handed over → first frame presented), JS heap after load | common driver |
| Validation | Selected-series count at fixed brush positions | adapters |

FPS is always computed from frame time, never measured directly.

**Frame time definition** (identical for every implementation, and identical to
the existing TimeWidget monitor so numbers stay comparable): `performance.now()`
at the next `requestAnimationFrame` minus `performance.now()` immediately before
the brush update is applied.

## 5. Implementations compared

All four receive the same tidy data (`{id, xCoord, yCoord}`), the same plot size,
and the same brush trajectory.

| Adapter | What it is | Selection semantics |
|---|---|---|
| `timewidget` | `dist/TimeWidget.js`, medians off | segment ∩ box via BVH (as shipped) |
| `canvas` | naive Canvas 2D: per-frame `beginPath/lineTo/stroke` per series, brute-force segment ∩ box over all segments | identical to TimeWidget |
| `svg` | naive d3 SVG: one `<path>` per series, brute-force segment ∩ box, class toggle for selection | identical to TimeWidget |
| `vegalite` | Vega-Lite (latest: vega-lite 6.4.3, vega 6.4.0, vega-embed 7.3.0, pinned exactly), line mark with `detail: id`, interval selection, highlight via `vlSelectionTest` + `joinaggregate` max by `id`, canvas renderer | **point-in-box** (Vega-Lite cannot express segment ∩ box) |

The baselines are deliberately straightforward, not deliberately bad: they are
what a competent developer writes first. Their code goes in the repo so
reviewers can judge fairness.

**Equivalence check.** Before measuring, at five fixed brush positions (and
per group when 3 groups are active), `canvas` and `svg` must return exactly
TimeWidget's selected count; `vegalite`
reports its agreement percentage (expected high but not 100% because of
point vs. segment semantics). A mismatch for `canvas`/`svg` aborts the run.

**To verify during implementation:** the exact Vega-Lite signal names for
setting an interval selection programmatically (`brush_x`/`brush_y` vs. the
selection store) and whether `view.runAsync()` completes rendering within the
same task. If Vega-Lite cannot be driven without real pointer events, fall back
to Playwright `page.mouse` drags for that adapter only and say so in the paper.
For 3 brush groups, Vega-Lite needs three interval params; if that cannot be
driven programmatically, the `vegalite` adapter runs the 1-group condition only
and the results say so.

## 6. Protocol

**Independent variables**

- Number of series, log-spaced: 1k, 2k, 5k, 10k, 20k, 50k, 100k. An adapter
  stops climbing once its p95 exceeds 250 ms (SVG will stop early).
- Points per series: 20 (main sweep), plus a secondary sweep of 20 / 100 / 500
  at 5k series.
- Brush groups: 1 (main sweep) and 3. With 3 groups, each group holds one brush
  at a different vertical band; two stay still and one moves along the
  trajectory, which is what a user dragging one TimeBox does. Every group is
  re-evaluated each frame, as `brushFilter` does. Run for the main series sweep
  at 20 points per series.
- Implementation: the four adapters above.

**Controlled**

- Seeded data generator (same as `example/Performance.html`, but with an inlined
  PRNG instead of the CDN `seedrandom`).
- Plot 800×600 CSS px inside a 1200×800 viewport; `deviceScaleFactor: 1` on every
  machine (native DPR recorded, not used).
- One brush, 20% × 25% of the extent, triangle sweep over 3 cycles; 60 warm-up
  + 300 measured frames; group medians off.
- Browser: Playwright's bundled Chromium, version pinned via `package-lock.json`,
  **headed**, flags `--disable-gpu-vsync --disable-frame-rate-limit`. Optional
  `--channel chrome` run as an ecological check.
- Page served by a small local server with COOP/COEP headers so the page is
  cross-origin isolated and timers resolve to ~5 µs.
- d3, vega, vega-lite loaded from `node_modules`, never a CDN.

**Repetitions and statistics**

- 5 fresh browser launches per cell; cell order randomised with a fixed seed so
  thermal drift spreads across conditions. First cell of a session discarded.
- Per cell: median of the 5 runs' p50/p95, with a bootstrap 95% CI.
- `maxSamples` set ≥ frames, so the ring buffer never drops measured frames.

**Run time.** Full sweep ≈ 2–3 h. Cells are appended to a JSONL file as they
finish and `--resume <file>` skips completed cells, so an interrupted run is not
lost. A `--quick` profile (1k/10k/50k, 2 reps,
TimeWidget only) takes a few minutes for sanity checks.

## 7. Environment gate and metadata

**Gate — abort the run (or the cell) unless:**

- CDP `SystemInfo.getInfo` reports `2d_canvas === "enabled"` and
  `gpu_compositing === "enabled"`. `--allow-software-raster` overrides, and
  labels the results as a software-raster worst case.
- The page is visible and focused at the start and end of every cell
  (`document.visibilityState`, `document.hasFocus()`); the runner calls
  `bringToFront()` before each cell.
- The adapter equivalence check passes (§5).

**Recorded in every result file:** OS + version, CPU model, core count, RAM,
GPU vendor/renderer + driver and `featureStatus` (CDP), browser name/version/
channel/headed, Playwright and Node versions, display refresh rate **from the OS**
(the page cannot detect it with vsync off and a forced viewport), native DPR,
viewport and plot size, TimeWidget version + git SHA + dirty flag, d3/vega
versions, power source where detectable, 1-min load average before and after,
timestamp, and the full CLI arguments.

## 8. Architecture

```
bench/
  README.md            how co-authors run it and what to send back
  run.mjs              CLI: parses options, starts server, loops cells, writes results
  server.mjs           static server over repo root, 127.0.0.1 only, COOP/COEP headers
  env.mjs              CDP SystemInfo + OS facts -> metadata; the gate
  stats.mjs            pure: percentiles, bootstrap CI, threshold crossings, slope/R², CSV rows
  page.html            harness page: loads d3/vega from node_modules, dist/TimeWidget.js, driver
  driver.js            in-page: data generator, brush trajectory, frame timing, load timing
  adapters/
    timewidget.js  canvas.js  svg.js  vegalite.js
  results/             scratch output (gitignored)
  results/paper/       final datasets used in the paper (committed, for artifact review)
tests/
  benchStats.test.js   jest, unit tests for stats.mjs
  e2e/bench.spec.js    headless smoke: each adapter loads, runs 10 frames, passes equivalence
```

**Adapter interface** (each file exports one factory):

```js
// create(container, {width, height}) -> adapter
{
  load(data) -> Promise<void>,          // render the initial state
  setBrush([[x0, yHigh], [x1, yLow]]),  // apply one brush step; rendering may be sync or scheduled
  selectedCount() -> number,            // for the equivalence check
  breakdown() -> object | null,         // TimeWidget's CPU breakdown; null for baselines
  destroy()
}
```

The brush domain uses TimeWidget's `[[xLow, yHigh], [xHigh, yLow]]` convention
(see CLAUDE.md); adapters convert as needed.

**TimeWidget change needed.** `runBrush` owns its own frame loop, so the common
driver cannot step it. Refactor `src/PerformanceBenchmark.js` to expose
`prepareBrush(options) -> { move(selectionDomain) }`, and have `runBrush` call it,
so `example/Performance.html` keeps working unchanged. This is the only change
under `src/`.

**`package.json`:** `"bench": "npm run build && node bench/run.mjs"`, plus
`vega`, `vega-lite`, `vega-embed` as exact-version devDependencies. Bench code
is loaded directly by the browser, not through rollup, so the ancient-acorn
syntax restriction does not apply to it, but it does apply to the `src/` refactor.

**Output.** `bench/results/<hostname>-<YYYYMMDD-HHmm>.json` (metadata + every
run's raw per-frame arrays) and a `.csv` with one row per (adapter, lines,
points) whose columns start with the spreadsheet's (`Número de líneas`,
FPS mean/p50/p5/p1, FrameMs, CollisionMs, RenderMs, TotalCpuMs at
mean/p50/p95/p99), followed by CI bounds, load time and adapter. The CSV can be
pasted straight into the existing sheet.

## 9. Testing

Following the repo's pyramid (CLAUDE.md, "Testing"):

- **Unit (jest):** `stats.mjs` — percentile and bootstrap against known inputs,
  threshold crossing interpolation, CSV column order matches the spreadsheet.
- **E2E smoke (playwright, headless, existing suite):** every adapter loads 1k
  series, runs 10 frames, returns finite numbers, and passes the equivalence
  check. Asserts behaviour, never timing. Prove it fails by breaking an
  adapter's intersection test.
- **The benchmark itself is never a pass/fail test** and never runs in CI.
- **Manual validation once, before collecting paper data:** (a) re-run this
  spike's two-monitor comparison through `npm run bench` and confirm agreement;
  (b) cross-check driver frame times against presented frames from a CDP trace
  at 3 sizes; (c) manual `Performance.html` vs. automated `timewidget` adapter on
  one machine — TotalCpuMs must agree.

## 10. Reporting in the paper (guidance, not built here)

- Log–log plot of frame-time p50 with p95 band vs. number of series, one panel
  per machine, one line per implementation, horizontal guides at 16.7 / 33.3 /
  100 ms.
- Table of N₆₀ / N₃₀ / N₁₀₀ per machine × implementation.
- Stacked CPU breakdown for TimeWidget vs. N.
- Wording: "On <machine>, TimeWidget keeps p95 frame time within the 60 Hz budget
  up to N₆₀ series and below 100 ms up to N₁₀₀; frame time grows linearly with
  total points (s ms per 100k, R² = …)."
- Hardware: at least the M4 Max, the Ryzen/GTX 1060 desktop and **one
  low-end integrated-GPU laptop**; at least macOS and Windows.

**Threats to validity to state:** synthetic data; one trajectory (1 or 3 groups);
Chromium only; in-page timing vs. presented frames (mitigated by the trace
cross-check); GC/JIT; thermal throttling; Vega-Lite's different selection
semantics; vsync-off is a throughput measurement, not what a user sees.

## 11. Decisions made

| Decision | Choice | Why |
|---|---|---|
| Headline metric | Vsync-off frame time | Monitor-independent and includes raster cost (§2) |
| Headless? | Headed | Default headless shell = software raster. New headless (`channel: "chromium"`) kept GPU raster in one spot-check, but its timing was never compared against headed across sizes, so it is not trusted for paper data |
| Where it lives | `bench/` + `npm run bench`, not inside `tests/e2e` | It is a measurement, not a pass/fail test; needs `workers: 1` and no CI |
| Baselines | Naive Canvas, naive SVG, Vega-Lite (latest) | Fair, obvious, and a widely used general-purpose grammar |
| Browser | Pinned bundled Chromium; system Chrome as optional check | Same build on every machine |
| Old manual numbers | Not mixed with new results | Vsync-capped and single-run; both Windows machines re-run |

## 12. Resolved and open questions

Resolved 2026-10-07 (John): points-per-series sweep **kept**; 3-brush-group
condition **added**; final paper datasets **committed** under
`bench/results/paper/`.

Open:

1. **Low-end machine** — possibly Iván; to confirm.
2. Does Iván agree with the headline metric change? He has context on the
   previous reviews that we do not.
