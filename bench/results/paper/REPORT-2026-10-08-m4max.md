# TimeWidget performance: first benchmark results

**Date of run:** 2026-10-08 · **Machine:** Apple M4 Max (one machine only) · **Status:** first dataset, not yet paper-ready

This report summarises the first full run of `npm run bench`, the reproducible
benchmark added in #71. It is meant for the team to decide what the paper can
claim and what to do next. It covers the results, the decisions behind how we
measure, instructions for running it on your own machine, and our
recommendations. The raw data is in the files next to this report
(`m4max-20261008-1939.jsonl`, `.csv`, `.summary.json`).

**Contents:** [Summary](#summary) · [Decisions we made](#decisions-we-made) ·
[What was measured](#what-was-measured) · [Results](#results) ·
[What this means for the paper](#what-this-means-for-the-paper) ·
[Recommendations](#recommendations) ·
[Instructions for team members](#instructions-for-team-members) ·
[Caveats](#caveats)

## Summary

1. **TimeWidget scales linearly** with the amount of data: about 5.6 ms per
   100,000 points (R² = 0.98).
2. **It stays smooth up to large sizes**: 60 fps up to about 19,000 lines and
   30 fps up to about 38,500 lines (20 points per line, one brush).
3. **It is 14–17× faster than Vega-Lite**, which stops being usable at a few
   thousand lines.
4. **It is not faster than a naive Canvas implementation when lines are
   short.** With 20 points per line, naive Canvas is 20–45% faster, and almost
   2× faster at 100,000 lines.
5. **It is clearly faster than naive Canvas when lines are long**: 2× at 100
   points per line and 2.8× at 500.
6. These numbers come from **one high-end machine**. We need Iván's machines,
   and ideally a low-end laptop, before drawing conclusions for the paper.

## Decisions we made

Each decision below replaced something in the old process (the manual
`example/Performance.html` page and spreadsheet). The reason is the evidence
that forced it.

| # | Decision | Why |
|---|---|---|
| 1 | **Do not reuse the old spreadsheet numbers.** | The old FPS figure was capped by the monitor. Same machine, same build, same data: about 121 FPS on a 120 Hz screen and 60 FPS on a 60 Hz one. At 15,000 lines the 60 Hz screen reported 60 FPS while the widget could do 79. |
| 2 | **Report frame time in ms, with vsync off.** FPS is only derived from it. | With vsync and the frame-rate limit off, the two screens agreed within about 3%, and frame times were no longer rounded to the refresh period. |
| 3 | **Run in a real, visible browser. Never headless.** | Playwright's default headless mode draws the canvas in software: 14 FPS vs 60 FPS at 20,000 lines with identical JavaScript time. This is the likely reason the earlier AI-driven attempt got much lower FPS. |
| 4 | **A frame costs as much as its slowest stage**: the page's own work or Chrome's GPU process, whichever is longer. | The page's clock cannot see painting that happens after JavaScript finishes. For naive SVG that hidden work is the larger part (42 of 42 ms at 50,000 lines). |
| 5 | **Pace the frames** with a short busy-wait gap (10 ms, doubled automatically when needed). | Without a gap, naive SVG's JavaScript outran the GPU and Chrome dropped about 90% of its frames. Adding 1 ms of useless work then made SVG measure *faster* (20 ms → 5 ms), which no real cost can do. Sleeping instead of busy-waiting let the CPU slow down and inflated JavaScript time by 75–140%. |
| 6 | **Compare against three baselines**: naive Canvas, naive SVG, Vega-Lite. | "Scales well" needs something to be compared with: the two things a developer would build first, and one widely used tool. |
| 7 | **Every baseline must select the same lines as TimeWidget**, checked before each session. | Otherwise a baseline could look cheaper just by answering a smaller question. |
| 8 | **Same conditions everywhere**: pinned Chromium from Playwright, 800 × 600 plot, device pixel ratio 1, seeded data, same brush path. | So that differences between machines come from the machines. A Retina screen would otherwise draw 4× the pixels. |
| 9 | **5 fresh browser launches per configuration, in random order**, reporting the median and a confidence interval. | The old process ran each size once, in one session, so there was no way to tell signal from noise. |
| 10 | **The benchmark refuses to run in conditions it cannot trust**: software rendering, a hidden or unfocused window, coarse timers. | Each of these produced numbers that looked plausible and were wrong. |
| 11 | **Judge interactivity by the 95th percentile**, not the average. | Occasional slow frames are what users notice. |
| 12 | **Do not claim the BVH makes brushing cost grow more slowly than the data.** | The code visits every line on every frame, and the measured collision cost grows linearly. |
| 13 | **Paper datasets are committed** under `bench/results/paper/`, with machine names removed. | For artifact review, and so everyone works from the same numbers. |

## What was measured

The benchmark moves one brush (TimeBox) across the plot in 300 small steps
and measures how long each redraw takes. Lower is better: 16.7 ms per frame is
60 fps, 33.3 ms is 30 fps, and above 100 ms an interaction feels laggy.

Four implementations get the same data, the same plot size and the same brush
path:

| Implementation | What it is |
|---|---|
| **TimeWidget** | the library as shipped (`dist/TimeWidget.js`), group medians off |
| **Naive Canvas** | what a developer writes first: test every line against the brush, redraw everything, no spatial index, no cached paths |
| **Naive SVG** | one `<path>` per line with d3, restyled every frame |
| **Vega-Lite** 6.4.3 | a line chart with interval selections and a highlight layer |

Before measuring, the benchmark checks that all four select the same lines.
Naive Canvas and SVG match TimeWidget exactly. Vega-Lite agrees on 95.4% of
selections with one brush and 96.0% with three; it can only test whether
*points* fall inside a brush, not whether a line *crosses* it.

**Frame cost** is the time of the slowest stage of each frame: either the
page's own work (JavaScript, on the main thread) or the painting work in
Chrome's GPU process, read from a Chrome trace. Vsync is off, so the monitor's
refresh rate does not cap the result. Each configuration ran in 5 fresh browser
launches, in random order; tables show the median across runs.

### Setup

| | |
|---|---|
| Machine | Apple M4 Max, 14 cores, 36 GB RAM, built-in GPU (Metal) |
| OS | macOS, Darwin 27.0.0 |
| Browser | Chromium 151.0.7922.34 (Playwright 1.62.1), headed, GPU canvas enabled |
| Plot | 800 × 600 px, device pixel ratio forced to 1 |
| TimeWidget | 0.0.33 at commit `0c1f2a3` (merged to `main` as `910262a`) |
| Runs | 279 completed, 0 rejected, 0 crashed, 41 skipped as too slow |

## Results

All tables show **median / 95th percentile frame cost in ms**. † = the run
hit the 60-second time budget before finishing all frames (see Caveats).
‡ = not run because a smaller size was already too slow.

### Number of lines, 20 points per line, one brush

| Lines | TimeWidget | Naive Canvas | Naive SVG | Vega-Lite |
|---:|---:|---:|---:|---:|
| 1,000 | 0.8 / 1.1 | 0.6 / 0.7 | 0.8 / 0.9 | 9.4 / 10 |
| 2,000 | 1.3 / 1.7 | 1.2 / 1.2 | 1.3 / 1.5 | 20 / 21 |
| 5,000 | 2.8 / 3.5 | 2.8 / 3.0 | 3.2 / 3.3 | 50 / 62 |
| 10,000 | 7.1 / 8.0 | 5.8 / 6.2 | 6.2 / 6.5 | 103 / 130 |
| 20,000 | 16 / 17 | 13 / 13 | 12 / 13 | 205 / 257 † |
| 50,000 | 40 / 43 | 29 / 30 | 42 / 44 | 700 / 887 † |
| 100,000 | 115 / 120 | 62 / 64 | 80 / 81 † | not run ‡ |

### Three brush groups (one moving, two static)

| Lines | TimeWidget | Naive Canvas | Naive SVG | Vega-Lite |
|---:|---:|---:|---:|---:|
| 1,000 | 1.2 / 1.7 | 0.8 / 0.9 | 0.7 / 0.8 | 10 / 11 |
| 2,000 | 2.0 / 2.4 | 1.6 / 1.7 | 1.3 / 1.4 | 21 / 23 |
| 5,000 | 4.1 / 4.9 | 4.0 / 4.2 | 2.9 / 3.1 | 54 / 68 |
| 10,000 | 9.6 / 11 | 8.4 / 9.0 | 5.7 / 5.8 | 110 / 143 |
| 20,000 | 22 / 23 | 18 / 19 | 11 / 12 | 229 / 301 † |
| 50,000 | 57 / 60 | 41 / 43 | 41 / 43 | 785 / 1115 † |
| 100,000 | 150 / 157 † | 91 / 93 | 85 / 87 | not run ‡ |

### Longer lines: 5,000 lines, one brush

| Points per line | TimeWidget | Naive Canvas | Naive SVG | Vega-Lite |
|---:|---:|---:|---:|---:|
| 20 | 2.8 / 3.5 | 2.8 / 3.0 | 3.2 / 3.3 | 50 / 62 |
| 100 | 6.6 / 7.3 | 13 / 13 | 6.0 / 6.3 | 194 / 240 † |
| 500 | 23 / 25 | 67 / 69 | 29 / 30 | no frames within the budget † |

This is where TimeWidget's design pays off: its cost grows much more slowly
with line length than naive Canvas's.

### How many lines stay interactive (20 points per line)

The largest number of lines whose 95th-percentile frame cost stays within each
budget, interpolated between measured sizes, plus the linear fit of median
frame cost against total points.

| Implementation | Brushes | 60 fps | 30 fps | 100 ms | ms per 100k points | R² |
|---|---:|---:|---:|---:|---:|---:|
| TimeWidget | 1 | ~19,000 | ~38,500 | ~88,000 | 5.6 | 0.980 |
| TimeWidget | 3 | ~14,700 | ~28,300 | 50,000–100,000 § | 5.7 | 0.999 |
| Naive Canvas | 1 | ~25,800 | ~55,000 | > 100,000 | 3.1 | 0.999 |
| Naive Canvas | 3 | ~17,600 | ~37,700 | > 100,000 | 4.5 | 0.998 |
| Naive SVG | 1 | ~24,400 | ~41,000 | > 100,000 § | 4.2 | 0.987 |
| Naive SVG | 3 | ~25,800 | ~42,100 | > 100,000 | 4.3 | 0.996 |
| Vega-Lite | 1 | ~1,600 | ~3,000 | ~7,800 | 51.8 | 1.000 |
| Vega-Lite | 3 | ~1,500 | ~2,700 | ~7,100 | 55.5 | 1.000 |

§ The generated `summary.json` reports 50,000 for these two cells because the
100,000-line run hit the time budget (see Caveats). The values here are read
from the measured frames instead: naive SVG measured 80 ms at 100,000 lines,
under the 100 ms budget; TimeWidget with three brushes measured 157 ms, over it.

### Where the time goes: page work vs. painting

Median ms per frame, one brush, 20 points per line.

| Lines | Implementation | Main thread | GPU process | Frame cost | Slower stage |
|---:|---|---:|---:|---:|---|
| 10,000 | TimeWidget | 7.1 | 5.2 | 7.1 | main thread |
| 10,000 | Naive Canvas | 5.8 | 1.5 | 5.8 | main thread |
| 10,000 | Naive SVG | 2.9 | 6.2 | 6.2 | GPU |
| 50,000 | TimeWidget | 40 | 24 | 40 | main thread |
| 50,000 | Naive Canvas | 29 | 12 | 29 | main thread |
| 50,000 | Naive SVG | 11 | 42 | 42 | GPU |
| 100,000 | TimeWidget | 115 | 46 | 115 | main thread |
| 100,000 | Naive Canvas | 62 | 23 | 62 | main thread |
| 100,000 | Naive SVG | 22 | 80 | 80 | GPU |

- TimeWidget and naive Canvas are limited by JavaScript; naive SVG is limited
  by the GPU. On a machine with a weaker GPU, SVG should fall behind first.
- TimeWidget asks about **2× more of the GPU than naive Canvas** for the same
  picture (24 vs 12 ms at 50,000 lines). We have not looked into why.

### Inside TimeWidget's main-thread time

Median ms per frame, from TimeWidget's own performance monitor.

| Lines | Collision | Issuing draw commands | Other work inside the widget | Outside the widget's timers | Main thread total |
|---:|---:|---:|---:|---:|---:|
| 10,000 | 2.7 | 2.2 | 1.3 | 1.0 | 7.1 |
| 50,000 | 18 | 14 | 6.1 | 2.8 | 40 |
| 100,000 | 37 | 34 | 13 | 31 | 115 |

- **Collision alone costs about as much as naive Canvas's whole frame budget
  for filtering.** `brushFilter` visits every line on every frame; with short
  lines the BVH has little to prune.
- **About 31 ms at 100,000 lines is spent outside the widget's own timers**,
  but only 2.8 ms at 50,000. Something starts costing much more at very large
  sizes. Unidentified; candidates are garbage collection and the per-frame
  rebuild of the brush controls and of the selection value.

### Load time

Median ms from handing over the data to the first frame with the brush on.

| Lines | TimeWidget | Naive Canvas | Naive SVG | Vega-Lite |
|---:|---:|---:|---:|---:|
| 1,000 | 59 | 10 | 28 | 140 |
| 10,000 | 323 | 36 | 76 | 706 |
| 50,000 | 1,415 | 126 | 331 | 3,256 |
| 100,000 | 2,961 | 274 | 598 | not run |

TimeWidget takes about 10× longer than naive Canvas to load, which is the cost
of building its index up front.

## What this means for the paper

**Supported by this data**

- Frame cost grows linearly with data size.
- Interactive rates up to tens of thousands of lines (hundreds of thousands of
  points) on this machine.
- A large advantage over Vega-Lite, a widely used general-purpose tool.
- An advantage over a naive Canvas implementation for long series, growing
  with series length.

**Not supported by this data**

- "Faster than a straightforward implementation" in general. For short lines,
  naive Canvas and naive SVG are as fast or faster on this machine.
- Any claim that the BVH makes brushing cost grow more slowly than the number
  of lines. Collision cost grows linearly here.

**Open question for the team:** do we (a) frame the claim around linear
scaling, the Vega-Lite comparison and long series, or (b) first optimise
TimeWidget's per-frame work for short lines (the collision scan and the 31 ms
of untimed work look like the places to start) and re-run?

## Recommendations

**For the paper**

1. **Build the claim on what the data supports**: linear scaling, interactive
   rates up to tens of thousands of lines, a 14–17× advantage over Vega-Lite,
   and a growing advantage over naive Canvas as series get longer.
2. **Do not claim** that TimeWidget beats a straightforward implementation in
   general, or that the BVH makes brushing sub-linear. A reviewer can check
   both against these numbers.
3. **Show the comparison honestly, including where TimeWidget loses.** A plot
   of frame cost against number of lines (log–log, one line per
   implementation, with guides at 16.7, 33.3 and 100 ms) plus the
   "how many lines stay interactive" table says it all.
4. **State the Vega-Lite difference** (points vs. line crossings, 95–96%
   agreement) in the text, so a reviewer does not find it first.

**For TimeWidget itself**

5. **Look at the per-frame work for short lines.** Three leads, in order of
   size at 100,000 lines: the collision pass (37 ms), the 31 ms spent outside
   the widget's own timers, and the GPU load, which is 2× naive Canvas's for
   the same picture. If these improve, the short-line comparison may flip.
6. **Load time is 10× naive Canvas's** (3 s at 100,000 lines). Worth a
   sentence in the paper, or an optimisation if it matters to users.

**For the benchmark, before the paper run**

7. **Fix the time budget** so a slow-but-valid run is not cut off and counted
   as a failure (see Caveats).
8. **Stop putting the computer's name in file names and in the data**; use a
   label the person chooses. Until then, follow the renaming step below.
9. **Re-run on current `main`.** This dataset predates #73.

**For the data**

10. **At least three machines**, including one low-end laptop with integrated
    graphics and one Windows machine. This dataset is a best case for naive
    SVG because of the M4 Max's GPU.

## Instructions for team members

### Before you start

- Node.js and git installed, and a stretch of time during which the machine
  can be left alone: the full sweep took about 35 minutes on the M4 Max; allow
  up to 2–3 hours on a slower machine.
- Plugged into power. On a laptop, keep the lid open.
- Close other applications, especially anything that pops up notifications.

### Run it

```bash
git checkout main && git pull
npm ci
npx playwright install chromium   # once per machine
npm run bench -- --quick          # ~5 min: checks that your machine is accepted
npm run bench                     # the full sweep
```

Chromium windows will open and close by themselves for the whole run.

### While it runs

- **Do not use the machine.** Do not click, switch windows, or lock the
  screen. A run that loses focus is rejected.
- **Keep the display awake.** On macOS, run this in a second terminal before
  starting: `caffeinate -d -i`. On Windows, set "Turn off the display" and
  "Sleep" to "Never" for the duration.

### If something goes wrong

| What you see | What to do |
|---|---|
| `Environment rejected: 2d_canvas is ...` | Chrome is drawing in software. Check `chrome://gpu`. Remote Desktop and virtual machines cause this; run on the physical machine. |
| `Environment rejected: page not focused` | Another window took focus. Close it and start again. |
| `REJECTED ...` on a few runs | Those runs lost focus. The rest are fine; mention it when you send the data. |
| It stopped (sleep, Ctrl-C, crash) | Resume without losing finished runs: `npm run bench -- --resume bench/results/<file>.jsonl` |
| `Preflight: ...` | The implementations disagree on what is selected. Stop and tell the team; do not send the data. |

### What to send back

Three files appear in `bench/results/`: `<name>.jsonl`, `<name>.csv` and
`<name>.summary.json`. The `.jsonl` is the one that matters; it contains
everything, including your CPU, GPU, operating system and screen refresh rate.

**Remove your computer's name first.** The benchmark currently uses it as the
file name and stores it inside the `.jsonl`. Pick a short label for the
machine (for example `ryzen5800x-gtx1060` or `thinkpad-igpu`) and run, in
`bench/results/`:

```bash
OLD="<the part of the file name before -YYYYMMDD-HHMM>"   # your computer's name
NEW="<your label>"
for f in "$OLD"-*; do mv "$f" "${f/$OLD/$NEW}"; done
sed -i.bak "s/$OLD/$NEW/g" "$NEW"-*.jsonl && rm "$NEW"-*.jsonl.bak
```

Then copy the three files to `bench/results/paper/`, add a row for your
machine to `bench/results/paper/README.md`, and open a pull request. Please
also tell us whether it is a laptop or a desktop and anything unusual about
the run.

### What not to do

- Do not run it headless, in CI, in a virtual machine, or over Remote Desktop.
- Do not use `--allow-software-raster` unless we ask for a worst-case run.
- Do not copy numbers from the old spreadsheet next to the new ones.

More detail and all options are in `bench/README.md`. The design and the
reasoning behind the metric are in
`docs/superpowers/specs/2026-10-07-performance-benchmark-design.md`.

## Caveats

- **One machine, and a fast one.** The M4 Max's GPU makes naive SVG look
  better than it will on typical hardware. Results from other machines may
  change the ranking.
- **The data predates #73**, which changed 17 lines in `src/BrushInteraction.js`
  and `src/TimeWidget.js`. We have not checked whether those lines are on the
  per-frame path. Re-run on current `main` before quoting TimeWidget numbers.
- **Time budget.** Each run stops after 60 seconds including load. Eight
  configurations hit it (†). Their statistics rest on fewer frames, later
  repetitions were skipped (7 configurations have 1 run, 1 has 2, the other 54
  have 5), and the generated summary counts them as "too slow" even when the
  measured frames were fast. This is a weakness of the benchmark, not a result,
  and should be fixed before the paper run.
- **Precision.** For the 54 configurations with 5 runs, the 95% confidence
  interval of the median frame cost is 4% wide at the median and 24% at worst.
- **Vega-Lite answers a slightly different question** (points inside the brush
  rather than lines crossing it; 95–96% agreement), and with three brushes it
  only re-evaluates the brush that moved.
- **Synthetic data, one brush path.** Real datasets and real dragging may
  behave differently.
- **Chromium only.**
