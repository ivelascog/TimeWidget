# TimeWidget performance benchmark

Reproducible numbers for the paper: TimeWidget vs. a naive Canvas, a naive SVG
and a Vega-Lite implementation of the same brushing task, measured the same way
on every machine. Design and rationale:
`docs/superpowers/specs/2026-10-07-performance-benchmark-design.md`.

## Run it

```bash
npm ci
npx playwright install chromium   # once per machine
npm run bench                     # full sweep, ~2–3 h
```

A Chromium window opens for every run. **Leave the machine alone until it
finishes:** plug in power, close other apps, don't cover or minimise the
window, don't switch to another app. The benchmark checks this and rejects
runs where the page lost visibility or focus; a rejected run is logged and the
run can be resumed.

Quick sanity check (TimeWidget only, a few minutes):

```bash
npm run bench -- --quick
```

## What to send back

Everything lands in `bench/results/` (git-ignored):

| File | What |
|---|---|
| `<host>-<date>.jsonl` | the raw record: environment, every run with every frame. **Send this one.** |
| `<host>-<date>.csv` | one row per configuration; the first 21 columns match `rendimiento_TimeWidget.xlsx` |
| `<host>-<date>.summary.json` | per series: largest size under 16.7 / 33.3 / 100 ms (p95), ms per 100k points, R² |

Datasets that go into the paper are copied to `bench/results/paper/`, which is
committed.

## If it stops

Interrupted (sleep, Ctrl-C, crash)? Resume the same file; finished runs are
not repeated:

```bash
npm run bench -- --resume bench/results/<host>-<date>.jsonl
```

## Why it refuses to run

Before measuring, it checks the environment and aborts if:

- **`2d_canvas` / `gpu_compositing` is not `enabled`.** Software rendering makes
  frame time measure the missing GPU, not TimeWidget (14 vs 60 FPS at 20k
  series in our tests). Check `chrome://gpu`; Remote Desktop and VMs often
  cause it. `--allow-software-raster` runs anyway and labels the results as a
  software-raster worst case.
- **The page is not visible and focused.** Chrome throttles hidden or
  background pages while they still report "visible".
- **The page is not cross-origin isolated.** Timers would be coarsened to
  100 µs.
- **The naive baselines select different series than TimeWidget.** A cheaper
  baseline must not be one that answers a smaller query.

## What is measured

- **FrameMs** (headline): time from applying one brush step to the next
  `requestAnimationFrame`, with vsync and the frame-rate limit off so the
  monitor's refresh rate does not cap or quantise it. When Chrome's trace shows
  that fewer frames reached the screen than were produced (naive SVG), FrameMs
  is the interval between frames actually presented instead. FPS columns are
  `1000 / FrameMs`.
- **MainThreadMs**, **Presented ratio**: the in-page time and presented/produced
  frames, kept so the two definitions can be compared.
- **CollisionMs, RenderMs, TotalCpuMs** (TimeWidget only): its internal
  breakdown. RenderMs is the time to *issue* canvas commands; rasterisation
  happens later on the GPU and is only visible in FrameMs.
- 60 warm-up + 300 measured frames, 5 fresh browser launches per
  configuration, randomised order, median across runs with a bootstrap 95% CI.

## Options

```
--quick                      TimeWidget only, 1k/10k/50k, 2 reps
--adapters a,b               timewidget, canvas, svg, vegalite
--lines 1000,5000            series counts
--groups 1,3                 brush-group counts
--reps 5   --frames 300   --warmup 60   --seed 1
--channel chrome             use the installed Chrome instead of Playwright's Chromium
--allow-software-raster      see above
--resume <file.jsonl>        continue an interrupted session
--out <dir>                  output directory (default bench/results)
```
