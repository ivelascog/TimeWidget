# Performance Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run bench` — a reproducible, cross-machine benchmark that measures vsync-off frame time for TimeWidget and three baselines (naive Canvas, naive SVG, Vega-Lite) and writes CSV/JSON results matching the paper spreadsheet.

**Architecture:** A Node CLI (`bench/run.mjs`) serves the repo root with COOP/COEP headers and launches a fresh headed Chromium per (cell, repetition). In the page, a common driver (`bench/driver.js`) generates seeded data, loads one adapter, steps an identical brush trajectory frame by frame and times each step to the next `requestAnimationFrame`. Pure logic (workload geometry, statistics) lives in small ESM modules that jest tests directly.

**Tech Stack:** Node 24 ESM, Playwright 1.62 (`playwright` library, bundled Chromium), d3 v7, vega 6.4.0 / vega-lite 6.4.3 / vega-embed 7.3.0, jest 29 (native ESM), existing rollup build for `dist/`.

**Spec:** `docs/superpowers/specs/2026-10-07-performance-benchmark-design.md`

## Global Constraints

- Headline metric: frame time with `--disable-gpu-vsync --disable-frame-rate-limit`; FPS is always derived (`1000 / frameMs`).
- Browser: Playwright bundled Chromium, **headed**; `--channel chrome` optional. Never the default headless shell for measurements.
- `deviceScaleFactor: 1`, viewport 1200×800, plot `width: 800, height: 600` (TimeWidget's overview size incl. margins).
- Brush domain convention everywhere: `[[xLow, yHigh], [xHigh, yLow]]`.
- Series counts 1k, 2k, 5k, 10k, 20k, 50k, 100k; points 20 (main) and 100/500 at 5k series; brush groups 1 and 3 (main sweep, 20 points).
- 60 warm-up + 300 measured frames; 5 fresh launches per cell; order shuffled with a fixed seed; first cell of a session discarded.
- Stop climbing a series once a run's frame p95 > 250 ms; hard per-run measuring budget 60 s.
- Gate: `2d_canvas === "enabled"` and `gpu_compositing === "enabled"` unless `--allow-software-raster`; page visible + focused at start and end of each run.
- `src/` changes must parse with rollup-plugin-ascii's old acorn: no `??`, `?.`, object spread. `bench/` code is not bundled and may use modern syntax.
- Local server binds `127.0.0.1` only (same reason as `playwright.config.js`).
- Scratch results gitignored (`bench/results/`), paper datasets committed (`bench/results/paper/`).
- Never commit `dist/`. Conventional commits.

## Review Focus

1. **Vega-Lite brush silently not applied** (signal names wrong → nothing selected, frames look fast). Expected: the run aborts. Test: Task 7 smoke asserts vegalite agreement ≥ 0.9 and a selected count > 0.
2. **Very slow cell** (SVG at 100k series) hangs the run. Expected: run stops measuring after 60 s, records `truncated: true`, and later sizes of that series are skipped. Test: Task 3 unit test for `shouldSkip`, Task 3 driver budget honoured in Task 4 smoke via `budgetMs: 1`.
3. **Window not focused / occluded** gives throttled numbers that look plausible. Expected: run is rejected. Test: Task 8 `checkGate` unit tests on `{visible:false}` and `{focused:false}`.
4. **Interrupted run** (laptop sleeps, Ctrl-C after 2 h). Expected: `--resume` continues without redoing finished runs. Test: Task 9 unit test for `pendingRuns` against an existing JSONL.
5. **Adapters disagree on what is selected** (baseline cheaper because it selects less). Expected: preflight aborts. Test: Task 5/6 smoke compares counts with TimeWidget's.

---

## File structure

```
bench/
  README.md              co-author instructions
  run.mjs                CLI entry: options, loop, output
  plan.mjs               pure: cell list, run ordering, pruning, resume
  server.mjs             static server, 127.0.0.1, COOP/COEP
  env.mjs                metadata collection + gate (checkGate is pure)
  stats.mjs              pure: summaries, bootstrap, crossings, linear fit, sheet rows
  workload.js            pure, browser+node: PRNG, data, brush geometry, polyline∩box
  driver.js              browser: runCell, preflight
  page.html              harness page
  adapters/timewidget.js canvas.js svg.js vegalite.js
  results/.gitignore     ignores everything except paper/
src/PerformanceBenchmark.js   + prepareBrush, runBrush rebuilt on it
tests/benchWorkload.test.js  tests/benchStats.test.js  tests/benchPlan.test.js  tests/benchEnv.test.js
tests/e2e/bench.spec.js
package.json                  "bench" script
```

---

### Task 1: `prepareBrush` in TimeWidget's benchmark API

**Files:**
- Modify: `src/PerformanceBenchmark.js`
- Test: `tests/e2e/bench.spec.js` (created here, extended later)

**Interfaces:**
- Produces: `ts.performance.prepareBrush(domains: Domain[]) -> { move(groupIndex: number, domain: Domain): void, groupNames: string[] }`. Each domain becomes its own brush group named `"Performance benchmark " + (i + 1)`, all groups enabled. `runBrush` keeps its signature and behaviour, rebuilt on `prepareBrush`.

- [ ] **Step 1: Write the failing e2e test**

```js
// tests/e2e/bench.spec.js
import { test, expect } from "@playwright/test";

test.describe("benchmark API", () => {
  test("prepareBrush creates one group per domain and move() changes the selection", async ({ page }) => {
    await page.goto("/tests/e2e/fixture.html");
    const result = await page.evaluate(() => {
      const el = window.makeWidget(window.makeData(200));
      const ext = el.ts.getExtent();
      const [x0, x1] = [+ext.x[0], +ext.x[1]];
      const [y0, y1] = [+ext.y[0], +ext.y[1]];
      const d = (fx0, fx1, fyHigh, fyLow) => [
        [x0 + (x1 - x0) * fx0, y0 + (y1 - y0) * fyHigh],
        [x0 + (x1 - x0) * fx1, y0 + (y1 - y0) * fyLow],
      ];
      const handle = el.ts.performance.prepareBrush([d(0, 0.2, 1, 0), d(0.5, 0.6, 0.6, 0.4)]);
      const counts = () => handle.groupNames.map((n) => el.value.legacyValue.get(n).size);
      const before = counts();
      handle.move(0, d(0.8, 0.85, 0.1, 0.0));
      return { names: handle.groupNames, before, after: counts() };
    });
    expect(result.names).toEqual(["Performance benchmark 1", "Performance benchmark 2"]);
    expect(result.before[0]).toBe(200); // full-height brush selects everything
    expect(result.after[0]).toBeLessThan(200);
  });
});
```

Check `tests/e2e/fixture.html` for the exact `makeWidget`/`makeData` signatures first and adapt the two calls if they differ (e.g. options argument, `x`/`y` field names).

- [ ] **Step 2: Build and run — expect FAIL** (`prepareBrush is not a function`)

Run: `npm run build && npx playwright test tests/e2e/bench.spec.js`

- [ ] **Step 3: Implement**

Replace `firstCommittedBrush` and the brush setup of `runBrush` in `src/PerformanceBenchmark.js`:

```js
function committedBrushes(brushes) {
  const result = [];
  for (const group of brushes.getBrushesGroup().values()) {
    for (const brush of group.brushes) {
      result.push(brush);
      break;
    }
  }
  return result;
}

// inside createPerformanceBenchmark:
  function prepareBrush(domains) {
    const brushes = getBrushes();
    const groupNames = domains.map((_, i) => "Performance benchmark " + (i + 1));
    brushes.addFilters(
      domains.map((selectionDomain, i) => ({
        name: groupNames[i],
        isEnable: true,
        isActive: i === 0,
        brushes: [{ selectionDomain: selectionDomain }],
      })),
      true
    );
    const handles = committedBrushes(brushes);
    return {
      groupNames: groupNames,
      move: function (groupIndex, domain) {
        brushes.moveBrush(handles[groupIndex], domain);
      },
    };
  }
```

In `runBrush`, replace the `brushes.addFilters(...)` call and `firstCommittedBrush` with:

```js
    const handle = prepareBrush([
      [
        [asX(xMin), yHigh],
        [asX(xMin + brushWidth), yLow],
      ],
    ]);
```

and `brushes.moveBrush(brush, [...])` with `handle.move(0, [...])`. Remove the now-unused `const brushes = getBrushes();` from `runBrush`. Export `prepareBrush` in the returned object. No `?.`/`??`/spread.

- [ ] **Step 4: Run — expect PASS; also the existing suites**

Run: `npm run build && npx playwright test && npm test`
Expected: all green. Then open `example/Performance.html` via `npx http-server . -p 8099 -c-1 -a 127.0.0.1` and click Run benchmark once to confirm the report still appears.

- [ ] **Step 5: Commit**

```bash
git add src/PerformanceBenchmark.js tests/e2e/bench.spec.js
git commit -m "feat: expose prepareBrush for multi-group benchmark driving"
```

---

### Task 2: `bench/workload.js` — data, brush geometry, polyline ∩ box

**Files:**
- Create: `bench/workload.js`
- Test: `tests/benchWorkload.test.js`

**Interfaces:**
- Produces:
  - `mulberry32(seed: number) -> () => number`
  - `generateData(lines, points, seed = 12345) -> {id, xCoord, yCoord}[]` (row order: series-major, same model as `example/Performance.html`)
  - `dataExtent(data) -> {x: [min, max], y: [min, max]}`
  - `groupDomains(extent, groups) -> Domain[]` (group 0 = moving brush start; others static)
  - `trajectory(extent, totalFrames, {cycles = 3, widthRatio = 0.2, heightRatio = 0.25} = {}) -> (i) => Domain`
  - `preflightDomains(extent) -> Domain[]` (5 fixed positions)
  - `polylineIntersectsBox(xs, ys, domain) -> boolean`
  - `groupById(data) -> {ids: number[], xs: Float64Array[], ys: Float64Array[]}`

- [ ] **Step 1: Write failing tests**

```js
// tests/benchWorkload.test.js
import {
  mulberry32, generateData, dataExtent, groupDomains, trajectory,
  preflightDomains, polylineIntersectsBox, groupById,
} from "../bench/workload.js";

test("generateData is deterministic and sized lines*points", () => {
  const a = generateData(10, 20);
  const b = generateData(10, 20);
  expect(a).toHaveLength(200);
  expect(a).toEqual(b);
  expect(a[0]).toEqual({ id: 0, xCoord: 0, yCoord: expect.any(Number) });
  expect(a[19].xCoord).toBe(100);
});

test("mulberry32 differs per seed", () => {
  expect(mulberry32(1)()).not.toBe(mulberry32(2)());
});

test("trajectory sweeps inside the extent and keeps [[xLow,yHigh],[xHigh,yLow]]", () => {
  const ext = { x: [0, 100], y: [0, 50] };
  const step = trajectory(ext, 360);
  for (let i = 0; i < 360; i++) {
    const [[x0, yHigh], [x1, yLow]] = step(i);
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(100);
    expect(x1 - x0).toBeCloseTo(20);
    expect(yHigh).toBeGreaterThan(yLow);
  }
  expect(step(0)[0][0]).not.toBe(step(60)[0][0]);
});

test("groupDomains returns one domain per group, distinct bands", () => {
  const ext = { x: [0, 100], y: [0, 100] };
  const ds = groupDomains(ext, 3);
  expect(ds).toHaveLength(3);
  expect(new Set(ds.map((d) => d[0][1])).size).toBe(3);
  expect(groupDomains(ext, 1)).toHaveLength(1);
});

test("preflightDomains gives 5 domains", () => {
  expect(preflightDomains({ x: [0, 1], y: [0, 1] })).toHaveLength(5);
});

describe("polylineIntersectsBox", () => {
  const box = [[2, 4], [4, 2]]; // x 2..4, y 2..4
  test("segment crossing the box", () => {
    expect(polylineIntersectsBox([0, 6], [3, 3], box)).toBe(true);
  });
  test("segment fully inside", () => {
    expect(polylineIntersectsBox([2.5, 3.5], [3, 3], box)).toBe(true);
  });
  test("segment passing above", () => {
    expect(polylineIntersectsBox([0, 6], [5, 5], box)).toBe(false);
  });
  test("diagonal clipping a corner", () => {
    expect(polylineIntersectsBox([0, 6], [6, 0], box)).toBe(true);
  });
  test("diagonal missing the corner", () => {
    expect(polylineIntersectsBox([0, 1], [1, 0], box)).toBe(false);
  });
});

test("groupById splits series-major rows", () => {
  const g = groupById(generateData(3, 4));
  expect(g.ids).toEqual([0, 1, 2]);
  expect(g.xs[1]).toHaveLength(4);
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module`)

Run: `npx jest tests/benchWorkload.test.js`

- [ ] **Step 3: Implement `bench/workload.js`**

```js
// Pure workload definition shared by the browser driver and jest.
// Domains use TimeWidget's convention: [[xLow, yHigh], [xHigh, yLow]].

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same model as example/Performance.html: baseline, trend, seasonality and
// autocorrelated noise, x in [0, 100].
export function generateData(lines, points, seed = 12345) {
  const rnd = mulberry32(seed);
  const data = new Array(lines * points);
  let k = 0;
  for (let i = 0; i < lines; i++) {
    const baseline = 15 + rnd() * 70;
    const trend = (rnd() - 0.5) * 25;
    const amplitude = 2 + rnd() * 7;
    const frequency = 0.75 + rnd() * 1.5;
    const phase = rnd() * Math.PI * 2;
    let noise = (rnd() - 0.5) * 3;
    for (let j = 0; j < points; j++) {
      const time = points === 1 ? 0 : j / (points - 1);
      noise = noise * 0.75 + (rnd() - 0.5) * 2.5;
      data[k++] = {
        id: i,
        xCoord: time * 100,
        yCoord: baseline + trend * time + amplitude * Math.sin(Math.PI * 2 * frequency * time + phase) + noise,
      };
    }
  }
  return data;
}

export function dataExtent(data) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const d of data) {
    if (d.xCoord < x0) x0 = d.xCoord;
    if (d.xCoord > x1) x1 = d.xCoord;
    if (d.yCoord < y0) y0 = d.yCoord;
    if (d.yCoord > y1) y1 = d.yCoord;
  }
  return { x: [x0, x1], y: [y0, y1] };
}

function box(extent, fx0, fx1, fyCenter, heightRatio) {
  const [x0, x1] = extent.x;
  const [y0, y1] = extent.y;
  const h = (y1 - y0) * heightRatio;
  const yc = y0 + (y1 - y0) * fyCenter;
  return [
    [x0 + (x1 - x0) * fx0, yc + h / 2],
    [x0 + (x1 - x0) * fx1, yc - h / 2],
  ];
}

// Group 0 is the moving brush (centre band, starts at the left edge). Extra
// groups are static brushes in their own vertical bands.
export function groupDomains(extent, groups, { widthRatio = 0.2, heightRatio = 0.25 } = {}) {
  const statics = [
    [0.15, 0.2],
    [0.65, 0.8],
  ];
  const result = [box(extent, 0, widthRatio, 0.5, heightRatio)];
  for (let g = 1; g < groups; g++) {
    const [fx, fy] = statics[(g - 1) % statics.length];
    result.push(box(extent, fx, fx + widthRatio, fy, heightRatio));
  }
  return result;
}

// Triangle sweep across the x extent, same shape as ts.performance.runBrush.
export function trajectory(extent, totalFrames, { cycles = 3, widthRatio = 0.2, heightRatio = 0.25 } = {}) {
  const [x0, x1] = extent.x;
  const width = (x1 - x0) * widthRatio;
  const start = box(extent, 0, widthRatio, 0.5, heightRatio);
  const yHigh = start[0][1];
  const yLow = start[1][1];
  return function (i) {
    const progress = totalFrames === 1 ? 0.5 : (i + 1) / totalFrames;
    const phase = (progress * cycles * 2) % 2;
    const tri = phase <= 1 ? phase : 2 - phase;
    const left = x0 + (x1 - x0 - width) * tri;
    return [
      [left, yHigh],
      [left + width, yLow],
    ];
  };
}

export function preflightDomains(extent) {
  return [0.05, 0.25, 0.45, 0.65, 0.8].map((fx, i) => box(extent, fx, fx + 0.15, 0.3 + i * 0.1, 0.2));
}

// Liang–Barsky clip of each segment against the box: true if any part of the
// polyline lies inside or on the box.
export function polylineIntersectsBox(xs, ys, domain) {
  const [[bx0, by1], [bx1, by0]] = domain;
  for (let i = 0; i < xs.length - 1; i++) {
    if (segmentHitsBox(xs[i], ys[i], xs[i + 1], ys[i + 1], bx0, by0, bx1, by1)) return true;
  }
  if (xs.length === 1) {
    return xs[0] >= bx0 && xs[0] <= bx1 && ys[0] >= by0 && ys[0] <= by1;
  }
  return false;
}

function segmentHitsBox(ax, ay, bx, by, x0, y0, x1, y1) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return false;
    } else {
      const r = q[k] / p[k];
      if (p[k] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

export function groupById(data) {
  const ids = [];
  const xs = [];
  const ys = [];
  let current = null;
  let bx = [];
  let by = [];
  for (const d of data) {
    if (d.id !== current) {
      if (current !== null) {
        xs.push(Float64Array.from(bx));
        ys.push(Float64Array.from(by));
      }
      ids.push(d.id);
      current = d.id;
      bx = [];
      by = [];
    }
    bx.push(d.xCoord);
    by.push(d.yCoord);
  }
  if (current !== null) {
    xs.push(Float64Array.from(bx));
    ys.push(Float64Array.from(by));
  }
  return { ids, xs, ys };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx jest tests/benchWorkload.test.js`

- [ ] **Step 5: Commit**

```bash
git add bench/workload.js tests/benchWorkload.test.js
git commit -m "feat(bench): seeded workload, brush geometry and polyline-box test"
```

---

### Task 3: `bench/stats.mjs` and `bench/plan.mjs` — pure analysis and run planning

**Files:**
- Create: `bench/stats.mjs`, `bench/plan.mjs`
- Test: `tests/benchStats.test.js`, `tests/benchPlan.test.js`

**Interfaces:**
- Produces (`stats.mjs`):
  - `percentile(sorted, p)` — same linear interpolation as `src/PerformanceMonitor.js`
  - `summarize(values) -> {samples, mean, p50, p95, p99}`
  - `bootstrapCI(values, {iterations = 2000, alpha = 0.05, seed = 1} = {}) -> [lo, hi]` of the median
  - `thresholdCrossing(points: {n, ms}[], thresholdMs) -> {n: number|null, censored: boolean}`
  - `linearFit(xs, ys) -> {slope, intercept, r2}`
  - `SHEET_COLUMNS: string[]`, `toSheetRow(cell) -> (string|number)[]`
  - `aggregateCell(runs) -> cell` (median across runs of each statistic, CI on frame p50 and p95)
- Produces (`plan.mjs`):
  - `buildCells({adapters, lines, mainPoints, sweepLines, sweepPoints, groups}) -> Cell[]` where `Cell = {adapter, lines, points, groups}` and `cellKey(cell) -> string`
  - `seriesKey(cell) -> string` (cell without `lines`)
  - `orderRuns(cells, reps, seed) -> {cell, rep}[]` (round-robin by rep, shuffled inside each round)
  - `shouldSkip(cell, completed: RunRecord[], limitMs = 250) -> boolean`
  - `pendingRuns(ordered, completed) -> {cell, rep}[]`

- [ ] **Step 1: Write failing tests**

```js
// tests/benchStats.test.js
import {
  percentile, summarize, bootstrapCI, thresholdCrossing, linearFit,
  SHEET_COLUMNS, toSheetRow,
} from "../bench/stats.mjs";

test("percentile interpolates like PerformanceMonitor", () => {
  expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  expect(percentile([10], 0.95)).toBe(10);
  expect(percentile([], 0.5)).toBeNull();
});

test("summarize", () => {
  const s = summarize([4, 1, 3, 2]);
  expect(s).toMatchObject({ samples: 4, mean: 2.5, p50: 2.5 });
});

test("bootstrapCI brackets the median and is deterministic", () => {
  const v = [10, 11, 12, 13, 14];
  const [lo, hi] = bootstrapCI(v);
  expect(lo).toBeLessThanOrEqual(12);
  expect(hi).toBeGreaterThanOrEqual(12);
  expect(bootstrapCI(v)).toEqual([lo, hi]);
});

describe("thresholdCrossing", () => {
  const pts = [
    { n: 1000, ms: 2 }, { n: 10000, ms: 10 }, { n: 20000, ms: 20 }, { n: 50000, ms: 60 },
  ];
  test("interpolates in log-log between the bracketing sizes", () => {
    const r = thresholdCrossing(pts, 16.7);
    expect(r.censored).toBe(false);
    expect(r.n).toBeGreaterThan(10000);
    expect(r.n).toBeLessThan(20000);
  });
  test("null when even the smallest size is over", () => {
    expect(thresholdCrossing(pts, 1)).toEqual({ n: null, censored: false });
  });
  test("censored when never crossed", () => {
    expect(thresholdCrossing(pts, 100)).toEqual({ n: 50000, censored: true });
  });
});

test("linearFit recovers a line", () => {
  const f = linearFit([1, 2, 3], [3, 5, 7]);
  expect(f.slope).toBeCloseTo(2);
  expect(f.intercept).toBeCloseTo(1);
  expect(f.r2).toBeCloseTo(1);
});

test("sheet columns start with the spreadsheet's", () => {
  expect(SHEET_COLUMNS.slice(0, 21)).toEqual([
    "Número de líneas",
    "FPS mean", "FPS p50", "FPS p5", "FPS p1",
    "FrameMs mean", "FrameMs p50", "FrameMs p95", "FrameMs p99",
    "CollisionMs mean", "CollisionMs p50", "CollisionMs p95", "CollisionMs p99",
    "RenderMs mean", "RenderMs p50", "RenderMs p95", "RenderMs p99",
    "TotalCpuMs mean", "TotalCpuMs p50", "TotalCpuMs p95", "TotalCpuMs p99",
  ]);
  const frame = { samples: 5, mean: 10, p50: 10, p95: 20, p99: 25 };
  const row = toSheetRow({
    adapter: "canvas", lines: 1000, points: 20, groups: 1, runs: 5,
    frameMs: frame, frameP50CI: [9, 11], frameP95CI: [18, 22],
    collisionMs: null, renderMs: null, totalCpuMs: null, loadMs: 50, truncated: false,
  });
  expect(row[0]).toBe(1000);
  expect(row[1]).toBe(100); // FPS mean = 1000 / 10
  expect(row[3]).toBe(50); // FPS p5 = 1000 / p95
  expect(row[9]).toBe(""); // baselines have no collision breakdown
  expect(row).toHaveLength(SHEET_COLUMNS.length);
});
```

```js
// tests/benchPlan.test.js
import { buildCells, cellKey, orderRuns, shouldSkip, pendingRuns } from "../bench/plan.mjs";

const cfg = {
  adapters: ["timewidget", "svg"], lines: [1000, 10000], mainPoints: 20,
  sweepLines: 5000, sweepPoints: [100, 500], groups: [1, 3],
};

test("buildCells: main sweep x groups plus points sweep at 1 group", () => {
  const cells = buildCells(cfg);
  // 2 adapters * (2 lines * 2 groups + 2 sweep points) = 12
  expect(cells).toHaveLength(12);
  expect(cells).toContainEqual({ adapter: "svg", lines: 5000, points: 500, groups: 1 });
  expect(new Set(cells.map(cellKey)).size).toBe(12);
});

test("orderRuns: every cell once per rep, rounds in order, deterministic", () => {
  const cells = buildCells(cfg);
  const a = orderRuns(cells, 3, 7);
  expect(a).toHaveLength(36);
  expect(a.slice(0, 12).every((r) => r.rep === 0)).toBe(true);
  expect(orderRuns(cells, 3, 7)).toEqual(a);
  expect(orderRuns(cells, 3, 8)).not.toEqual(a);
});

test("shouldSkip once a smaller size of the same series exceeded the limit", () => {
  const big = { adapter: "svg", lines: 10000, points: 20, groups: 1 };
  const done = [{ cell: { ...big, lines: 1000 }, rep: 0, frameMs: { p95: 300 }, truncated: false }];
  expect(shouldSkip(big, done)).toBe(true);
  expect(shouldSkip({ ...big, adapter: "timewidget" }, done)).toBe(false);
  expect(shouldSkip(big, [{ ...done[0], frameMs: { p95: 20 } }])).toBe(false);
  expect(shouldSkip(big, [{ ...done[0], frameMs: { p95: 20 }, truncated: true }])).toBe(true);
});

test("pendingRuns drops completed (cell, rep) pairs", () => {
  const cells = buildCells(cfg);
  const ordered = orderRuns(cells, 2, 1);
  const completed = [{ cell: ordered[0].cell, rep: ordered[0].rep, frameMs: { p95: 1 } }];
  expect(pendingRuns(ordered, completed)).toHaveLength(ordered.length - 1);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx jest tests/benchStats.test.js tests/benchPlan.test.js`

- [ ] **Step 3: Implement `bench/stats.mjs`**

```js
import { mulberry32 } from "./workload.js";

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

export function summarize(values) {
  if (!values || !values.length) return { samples: 0, mean: null, p50: null, p95: null, p99: null };
  const s = values.slice().sort((a, b) => a - b);
  return {
    samples: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: percentile(s, 0.5),
    p95: percentile(s, 0.95),
    p99: percentile(s, 0.99),
  };
}

const median = (v) => percentile(v.slice().sort((a, b) => a - b), 0.5);

export function bootstrapCI(values, { iterations = 2000, alpha = 0.05, seed = 1 } = {}) {
  const rnd = mulberry32(seed);
  const stats = new Array(iterations);
  const sample = new Array(values.length);
  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < values.length; j++) sample[j] = values[Math.floor(rnd() * values.length)];
    stats[i] = median(sample);
  }
  stats.sort((a, b) => a - b);
  return [percentile(stats, alpha / 2), percentile(stats, 1 - alpha / 2)];
}

// Largest n whose ms stays <= threshold, interpolated in log-log space between
// the last size under and the first size over. Censored when never crossed.
export function thresholdCrossing(points, thresholdMs) {
  const pts = points.slice().sort((a, b) => a.n - b.n);
  if (!pts.length || pts[0].ms > thresholdMs) return { n: null, censored: false };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ms > thresholdMs) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (Math.log(thresholdMs) - Math.log(a.ms)) / (Math.log(b.ms) - Math.log(a.ms));
      return { n: Math.round(Math.exp(Math.log(a.n) + t * (Math.log(b.n) - Math.log(a.n)))), censored: false };
    }
  }
  return { n: pts[pts.length - 1].n, censored: true };
}

export function linearFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

const STATS = ["mean", "p50", "p95", "p99"];
const metricCols = (name) => STATS.map((s) => `${name} ${s}`);

export const SHEET_COLUMNS = [
  "Número de líneas",
  "FPS mean", "FPS p50", "FPS p5", "FPS p1",
  ...metricCols("FrameMs"), ...metricCols("CollisionMs"), ...metricCols("RenderMs"), ...metricCols("TotalCpuMs"),
  "Adapter", "Points per line", "Brush groups", "Runs",
  "FrameMs p50 CI low", "FrameMs p50 CI high", "FrameMs p95 CI low", "FrameMs p95 CI high",
  "LoadMs", "Truncated",
];

const fps = (ms) => (ms && ms > 0 ? 1000 / ms : "");
const cols = (m) => (m ? STATS.map((s) => m[s]) : STATS.map(() => ""));

export function toSheetRow(c) {
  const f = c.frameMs;
  return [
    c.lines,
    fps(f.mean), fps(f.p50), fps(f.p95), fps(f.p99),
    ...cols(f), ...cols(c.collisionMs), ...cols(c.renderMs), ...cols(c.totalCpuMs),
    c.adapter, c.points, c.groups, c.runs,
    c.frameP50CI[0], c.frameP50CI[1], c.frameP95CI[0], c.frameP95CI[1],
    c.loadMs, c.truncated,
  ];
}

const medianOf = (runs, get) => {
  const v = runs.map(get).filter((x) => x !== null && x !== undefined);
  return v.length ? median(v) : null;
};
const medianSummary = (runs, key) =>
  runs.every((r) => r[key])
    ? Object.fromEntries(["samples", ...STATS].map((s) => [s, medianOf(runs, (r) => r[key][s])]))
    : null;

// runs: RunRecord[] of one cell (see driver.js runCell return shape).
export function aggregateCell(runs) {
  const { adapter, lines, points, groups } = runs[0].cell;
  return {
    adapter, lines, points, groups, runs: runs.length,
    frameMs: medianSummary(runs, "frameMs"),
    frameP50CI: bootstrapCI(runs.map((r) => r.frameMs.p50)),
    frameP95CI: bootstrapCI(runs.map((r) => r.frameMs.p95)),
    collisionMs: medianSummary(runs, "collisionMs"),
    renderMs: medianSummary(runs, "renderMs"),
    totalCpuMs: medianSummary(runs, "totalCpuMs"),
    loadMs: medianOf(runs, (r) => r.loadMs),
    truncated: runs.some((r) => r.truncated),
  };
}
```

- [ ] **Step 4: Implement `bench/plan.mjs`**

```js
import { mulberry32 } from "./workload.js";

export const cellKey = (c) => `${c.adapter}|${c.lines}|${c.points}|${c.groups}`;
export const seriesKey = (c) => `${c.adapter}|${c.points}|${c.groups}`;

export function buildCells({ adapters, lines, mainPoints, sweepLines, sweepPoints, groups }) {
  const cells = [];
  for (const adapter of adapters) {
    for (const g of groups) for (const n of lines) cells.push({ adapter, lines: n, points: mainPoints, groups: g });
    for (const p of sweepPoints) cells.push({ adapter, lines: sweepLines, points: p, groups: 1 });
  }
  return cells;
}

function shuffle(array, rnd) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function orderRuns(cells, reps, seed) {
  const rnd = mulberry32(seed);
  const runs = [];
  for (let rep = 0; rep < reps; rep++) for (const cell of shuffle(cells, rnd)) runs.push({ cell, rep });
  return runs;
}

// A size is skipped once any run of the same series at a size <= it blew the
// limit or hit the time budget; sizes only get slower from there.
export function shouldSkip(cell, completed, limitMs = 250) {
  const key = seriesKey(cell);
  return completed.some(
    (r) => seriesKey(r.cell) === key && r.cell.lines <= cell.lines && (r.truncated || r.frameMs.p95 > limitMs)
  );
}

export function pendingRuns(ordered, completed) {
  const done = new Set(completed.map((r) => `${cellKey(r.cell)}#${r.rep}`));
  return ordered.filter((r) => !done.has(`${cellKey(r.cell)}#${r.rep}`));
}
```

Note: `shouldSkip` treats a run at the *same* size that blew the limit as a reason to skip further reps of it too — one 250 ms+ measurement at that size is enough to say it is past interactive.

- [ ] **Step 5: Run — expect PASS**

Run: `npx jest tests/benchStats.test.js tests/benchPlan.test.js`

- [ ] **Step 6: Commit**

```bash
git add bench/stats.mjs bench/plan.mjs tests/benchStats.test.js tests/benchPlan.test.js
git commit -m "feat(bench): statistics, sheet rows and run planning"
```

---

### Task 4: harness page, driver and TimeWidget adapter

**Files:**
- Create: `bench/page.html`, `bench/driver.js`, `bench/adapters/timewidget.js`
- Modify: `tests/e2e/bench.spec.js`

**Interfaces:**
- Consumes: `prepareBrush` (Task 1), `bench/workload.js` (Task 2).
- Produces:
  - Adapter contract (`resetBreakdown()` optional) (every `bench/adapters/*.js` default-exports `create(container, {width, height}) -> adapter`):
    `load(data, extent) -> Promise<void>`, `setGroups(domains: Domain[]) -> Promise<void>|void`, `move(groupIndex, domain) -> Promise<void>|void`, `selectedCounts() -> number[]` (one per group), `breakdown() -> {collisionMs, renderMs, totalCpuMs}|null`, `destroy()`.
  - `window.benchCell({adapter, lines, points, groups, frames = 300, warmupFrames = 60, budgetMs = 60000, seed = 12345}) -> Promise<RunResult>` where `RunResult = {frameMs, collisionMs, renderMs, totalCpuMs, loadMs, heapMB, truncated, measuredFrames, frames: number[], visible, focused}`.
  - `window.benchPreflight({adapters, lines, points, groups, seed}) -> Promise<{[adapter]: number[][]}>` — per adapter, per preflight domain, the group counts.

- [ ] **Step 1: Extend the e2e test (failing)**

Append to `tests/e2e/bench.spec.js`:

```js
test.describe("bench harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/bench/page.html");
    await page.waitForFunction(() => typeof window.benchCell === "function");
  });

  test("timewidget cell returns finite frame stats and a breakdown", async ({ page }) => {
    const r = await page.evaluate(() =>
      window.benchCell({ adapter: "timewidget", lines: 300, points: 20, groups: 3, frames: 10, warmupFrames: 2 })
    );
    expect(r.measuredFrames).toBe(10);
    expect(Number.isFinite(r.frameMs.p50)).toBe(true);
    expect(r.totalCpuMs.samples).toBeGreaterThan(0);
    expect(r.loadMs).toBeGreaterThan(0);
  });

  test("budget truncates a run", async ({ page }) => {
    const r = await page.evaluate(() =>
      window.benchCell({ adapter: "timewidget", lines: 300, points: 20, groups: 1, frames: 300, warmupFrames: 0, budgetMs: 1 })
    );
    expect(r.truncated).toBe(true);
    expect(r.measuredFrames).toBeLessThan(300);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (404 / `benchCell` never defined)

Run: `npx playwright test tests/e2e/bench.spec.js`

- [ ] **Step 3: `bench/page.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>TimeWidget benchmark harness</title>
  <style>body { margin: 0; font: 12px system-ui; } #stage { width: 800px; height: 600px; }</style>
</head>
<body>
  <div id="stage"></div>
  <script src="../node_modules/d3/dist/d3.js"></script>
  <script src="../node_modules/vega/build/vega.min.js"></script>
  <script src="../node_modules/vega-lite/build/vega-lite.min.js"></script>
  <script src="../node_modules/vega-embed/build/vega-embed.min.js"></script>
  <script src="../dist/TimeWidget.js"></script>
  <script type="module">
    import { runCell, preflight } from "./driver.js";
    window.benchCell = runCell;
    window.benchPreflight = preflight;
    window.crossOriginIsolatedAtLoad = window.crossOriginIsolated;
  </script>
</body>
</html>
```

- [ ] **Step 4: `bench/driver.js`**

```js
import { generateData, dataExtent, groupDomains, trajectory, preflightDomains } from "./workload.js";
import { summarize } from "./stats.mjs";

const SIZE = { width: 800, height: 600 };
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function mount(name) {
  const stage = document.getElementById("stage");
  stage.replaceChildren();
  const create = (await import(`./adapters/${name}.js`)).default;
  return create(stage, SIZE);
}

export async function runCell({
  adapter: name, lines, points, groups, frames = 300, warmupFrames = 60, budgetMs = 60000, seed = 12345,
}) {
  const data = generateData(lines, points, seed);
  const extent = dataExtent(data);
  const adapter = await mount(name);

  const t0 = performance.now();
  await adapter.load(data, extent);
  await adapter.setGroups(groupDomains(extent, groups));
  await nextFrame();
  await nextFrame();
  const loadMs = performance.now() - t0;

  const total = warmupFrames + frames;
  const step = trajectory(extent, total);
  const frameTimes = [];
  let truncated = false;
  const budgetStart = performance.now();
  for (let i = 0; i < total; i++) {
    if (i === warmupFrames && adapter.resetBreakdown) adapter.resetBreakdown();
    const start = performance.now();
    await adapter.move(0, step(i));
    await nextFrame();
    if (i >= warmupFrames) frameTimes.push(performance.now() - start);
    if (performance.now() - budgetStart > budgetMs) {
      truncated = true;
      break;
    }
  }

  const b = adapter.breakdown();
  const result = {
    frameMs: summarize(frameTimes),
    collisionMs: b ? b.collisionMs : null,
    renderMs: b ? b.renderMs : null,
    totalCpuMs: b ? b.totalCpuMs : null,
    loadMs,
    heapMB: performance.memory ? performance.memory.usedJSHeapSize / 2 ** 20 : null,
    truncated,
    measuredFrames: frameTimes.length,
    frames: frameTimes,
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
  };
  adapter.destroy();
  return result;
}

export async function preflight({ adapters, lines, points, groups, seed = 12345 }) {
  const data = generateData(lines, points, seed);
  const extent = dataExtent(data);
  const out = {};
  for (const name of adapters) {
    const adapter = await mount(name);
    await adapter.load(data, extent);
    const base = groupDomains(extent, groups);
    await adapter.setGroups(base);
    out[name] = [];
    for (const d of preflightDomains(extent)) {
      await adapter.move(0, d);
      await nextFrame();
      out[name].push(adapter.selectedCounts());
    }
    adapter.destroy();
  }
  return out;
}
```

Note the frame definition: `start` is taken before the brush update, and the frame ends at the next `requestAnimationFrame`, which matches `PerformanceMonitor`'s definition but also includes d3's `brush.move` DOM work that TimeWidget's internal timer starts after.

- [ ] **Step 5: `bench/adapters/timewidget.js`**

```js
// TimeWidget as shipped in dist/, driven through ts.performance.prepareBrush.
export default function create(container, { width, height }) {
  let el = null;
  let handle = null;
  return {
    async load(data) {
      el = window.TimeWidget(data, {
        target: container, x: "xCoord", y: "yCoord", id: "id",
        width, height, autoUpdate: true, showGroupMedian: false,
        performanceMonitoring: { log: false, maxSamples: 100000, reportEvery: 1e9 },
      });
    },
    setGroups(domains) {
      el.ts.performance.configure({ enabled: false });
      handle = el.ts.performance.prepareBrush(domains);
      el.ts.performance.configure({ enabled: true });
      el.ts.performance.reset();
    },
    move(groupIndex, domain) {
      handle.move(groupIndex, domain);
    },
    selectedCounts() {
      return handle.groupNames.map((n) => el.value.legacyValue.get(n).size);
    },
    resetBreakdown() {
      el.ts.performance.reset();
    },
    breakdown() {
      const r = el.ts.performance.report();
      return { collisionMs: r.collisionMs, renderMs: r.renderMs, totalCpuMs: r.totalCpuMs };
    },
    destroy() {
      el.ts.performance.configure({ enabled: false });
      container.replaceChildren();
    },
  };
}
```

`resetBreakdown` is optional in the adapter contract; the driver calls it right before the first measured frame so TimeWidget's breakdown excludes warm-up.

- [ ] **Step 6: Run — expect PASS**

Run: `npm run build && npx playwright test tests/e2e/bench.spec.js`

- [ ] **Step 7: Commit**

```bash
git add bench/page.html bench/driver.js bench/adapters/timewidget.js tests/e2e/bench.spec.js
git commit -m "feat(bench): harness page, common frame driver and TimeWidget adapter"
```

---

### Task 5: naive Canvas adapter

**Files:**
- Create: `bench/adapters/canvas.js`
- Modify: `tests/e2e/bench.spec.js`

**Interfaces:**
- Consumes: adapter contract (Task 4), `groupById`, `polylineIntersectsBox` (Task 2).

- [ ] **Step 1: Failing test — equivalence with TimeWidget**

```js
test("canvas and svg select exactly what TimeWidget selects", async ({ page }) => {
  for (const groups of [1, 3]) {
    const r = await page.evaluate(
      (g) => window.benchPreflight({ adapters: ["timewidget", "canvas"], lines: 1000, points: 20, groups: g }),
      groups
    );
    expect(r.canvas).toEqual(r.timewidget);
    expect(r.timewidget.flat().some((c) => c > 0)).toBe(true);
  }
});
```

(Placed inside the `bench harness` describe. Task 6 adds `"svg"` to the adapters list and an `r.svg` assertion.)

- [ ] **Step 2: Run — expect FAIL** (module not found)

- [ ] **Step 3: Implement**

```js
// What a competent developer writes first: redraw every series each frame,
// brute-force polyline/box test over every series and group.
import { groupById, polylineIntersectsBox } from "../workload.js";

const MARGIN = { left: 50, top: 30, right: 50, bottom: 50 }; // TimeWidget's default

export default function create(container, { width, height }) {
  const iw = width - MARGIN.left - MARGIN.right;
  const ih = height - MARGIN.top - MARGIN.bottom;
  const canvas = document.createElement("canvas");
  canvas.width = iw;
  canvas.height = ih;
  canvas.style.margin = `${MARGIN.top}px ${MARGIN.right}px ${MARGIN.bottom}px ${MARGIN.left}px`;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const colors = ["#1f77b4", "#ff7f0e", "#2ca02c"];
  let series, sx, sy, domains = [], selected = [];

  function filter() {
    selected = domains.map(() => new Set());
    for (let s = 0; s < series.ids.length; s++) {
      for (let g = 0; g < domains.length; g++) {
        if (polylineIntersectsBox(series.xs[s], series.ys[s], domains[g])) selected[g].add(s);
      }
    }
  }

  function strokeSeries(s) {
    const xs = series.xs[s];
    const ys = series.ys[s];
    ctx.moveTo(sx(xs[0]), sy(ys[0]));
    for (let i = 1; i < xs.length; i++) ctx.lineTo(sx(xs[i]), sy(ys[i]));
  }

  function draw() {
    ctx.clearRect(0, 0, iw, ih);
    const any = new Set();
    selected.forEach((set) => set.forEach((s) => any.add(s)));
    ctx.strokeStyle = "rgba(160,160,160,0.3)";
    ctx.beginPath();
    for (let s = 0; s < series.ids.length; s++) if (!any.has(s)) strokeSeries(s);
    ctx.stroke();
    selected.forEach((set, g) => {
      ctx.strokeStyle = colors[g % colors.length];
      ctx.beginPath();
      set.forEach(strokeSeries);
      ctx.stroke();
    });
  }

  return {
    load(data, extent) {
      series = groupById(data);
      sx = d3.scaleLinear().domain(extent.x).range([0, iw]);
      sy = d3.scaleLinear().domain(extent.y).range([ih, 0]);
      draw();
    },
    setGroups(ds) {
      domains = ds.slice();
      filter();
      draw();
    },
    move(g, domain) {
      domains[g] = domain;
      filter();
      draw();
    },
    selectedCounts: () => selected.map((s) => s.size),
    breakdown: () => null,
    destroy() {
      container.replaceChildren();
    },
  };
}
```

`load` before `setGroups` draws all series grey once (`selected = []`).

- [ ] **Step 4: Run — expect PASS.** If counts differ, print the first differing domain and series id and compare against `BVH.js`'s `lineIntersection` before touching either side: a boundary-tie difference is a finding to record, not something to paper over.

Run: `npx playwright test tests/e2e/bench.spec.js`

- [ ] **Step 5: Prove the test can fail:** temporarily change `polylineIntersectsBox` to `return false;`, run, see red, restore.

- [ ] **Step 6: Commit**

```bash
git add bench/adapters/canvas.js tests/e2e/bench.spec.js
git commit -m "feat(bench): naive canvas baseline"
```

---

### Task 6: naive SVG adapter

**Files:**
- Create: `bench/adapters/svg.js`
- Modify: `tests/e2e/bench.spec.js` (add `"svg"` to the equivalence test)

- [ ] **Step 1: Update the equivalence test** — adapters `["timewidget", "canvas", "svg"]` and add `expect(r.svg).toEqual(r.timewidget);`. Run, expect FAIL.

- [ ] **Step 2: Implement**

```js
// One <path> per series, the way a d3 tutorial does it; selection toggles
// stroke via attributes on every path each frame.
import { groupById, polylineIntersectsBox } from "../workload.js";

const MARGIN = { left: 50, top: 30, right: 50, bottom: 50 };

export default function create(container, { width, height }) {
  const iw = width - MARGIN.left - MARGIN.right;
  const ih = height - MARGIN.top - MARGIN.bottom;
  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const colors = ["#1f77b4", "#ff7f0e", "#2ca02c"];
  let series, paths, domains = [], selected = [];

  function filter() {
    selected = domains.map(() => new Set());
    for (let s = 0; s < series.ids.length; s++) {
      for (let k = 0; k < domains.length; k++) {
        if (polylineIntersectsBox(series.xs[s], series.ys[s], domains[k])) selected[k].add(s);
      }
    }
  }

  function style() {
    paths.attr("stroke", (s) => {
      for (let k = 0; k < selected.length; k++) if (selected[k].has(s)) return colors[k % colors.length];
      return "rgba(160,160,160,0.3)";
    });
  }

  return {
    load(data, extent) {
      series = groupById(data);
      const sx = d3.scaleLinear().domain(extent.x).range([0, iw]);
      const sy = d3.scaleLinear().domain(extent.y).range([ih, 0]);
      const line = (s) => {
        let d = `M${sx(series.xs[s][0])},${sy(series.ys[s][0])}`;
        for (let i = 1; i < series.xs[s].length; i++) d += `L${sx(series.xs[s][i])},${sy(series.ys[s][i])}`;
        return d;
      };
      paths = g.selectAll("path").data(d3.range(series.ids.length)).join("path")
        .attr("fill", "none").attr("d", line).attr("stroke", "rgba(160,160,160,0.3)");
    },
    setGroups(ds) {
      domains = ds.slice();
      filter();
      style();
    },
    move(k, domain) {
      domains[k] = domain;
      filter();
      style();
    },
    selectedCounts: () => selected.map((s) => s.size),
    breakdown: () => null,
    destroy() {
      container.replaceChildren();
    },
  };
}
```

- [ ] **Step 3: Run — expect PASS.** Run: `npx playwright test tests/e2e/bench.spec.js`

- [ ] **Step 4: Commit**

```bash
git add bench/adapters/svg.js tests/e2e/bench.spec.js
git commit -m "feat(bench): naive SVG baseline"
```

---

### Task 7: Vega-Lite adapter

**Files:**
- Create: `bench/adapters/vegalite.js`
- Modify: `tests/e2e/bench.spec.js`

**Interfaces:**
- Consumes: adapter contract; globals `vega`, `vegaLite`, `vegaEmbed` from `page.html`.
- `selectedCounts()` returns, per group, the number of series with **at least one point** inside the brush **as resolved by Vega** (read back from the `brushN_x`/`brushN_y` pixel signals and inverted through the view's scales), so a brush that never reached Vega shows up as 0.

- [ ] **Step 1: Failing test**

```js
test("vegalite applies brushes programmatically and mostly agrees with TimeWidget", async ({ page }) => {
  for (const groups of [1, 3]) {
    const r = await page.evaluate(
      (g) => window.benchPreflight({ adapters: ["timewidget", "vegalite"], lines: 1000, points: 20, groups: g }),
      groups
    );
    const tw = r.timewidget.flat();
    const vl = r.vegalite.flat();
    expect(vl.some((c) => c > 0)).toBe(true);
    const agreement = 1 - tw.reduce((s, c, i) => s + Math.abs(c - vl[i]), 0) / Math.max(1, tw.reduce((a, b) => a + b, 0));
    expect(agreement).toBeGreaterThan(0.9);
  }
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Spike the signal names (5 min, in the browser console of `bench/page.html`)**

Compile a 1-param spec with `vegaLite.compile(spec).spec` and list `signals` names containing `brush`. Expected (Vega-Lite 6): `brush0_x`, `brush0_y` (pixel ranges), `brush0_xCoord`/`brush0_yCoord` (data domain, derived), `brush0_tuple`. Confirm that `view.signal("brush0_x", [px0, px1]).signal("brush0_y", [py0, py1]); await view.runAsync();` changes the highlighted layer. If the pixel signals do not propagate, try setting the `_xCoord`/`_yCoord` data-domain signals; if neither works, stop and report — the spec's fallback (real `page.mouse` drags) changes the driver.

- [ ] **Step 4: Implement**

```js
// Vega-Lite as a general-purpose grammar would be used for this task: a line
// per series, interval params, highlight layer filtered to series with any
// point inside a brush. Point-in-box semantics (Vega-Lite cannot test segments).
const MARGIN = { left: 50, top: 30, right: 50, bottom: 50 };
const COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c"];

export default function create(container, { width, height }) {
  const iw = width - MARGIN.left - MARGIN.right;
  const ih = height - MARGIN.top - MARGIN.bottom;
  let view, data, groups = 0;

  function spec(nGroups, extent) {
    const params = [];
    for (let k = 0; k < nGroups; k++) params.push({ name: `brush${k}`, select: { type: "interval", encodings: ["x", "y"], clear: false } });
    const enc = {
      x: { field: "xCoord", type: "quantitative", scale: { domain: extent.x, nice: false, zero: false } },
      y: { field: "yCoord", type: "quantitative", scale: { domain: extent.y, nice: false, zero: false } },
      detail: { field: "id" },
    };
    const highlight = (k) => ({
      transform: [
        { calculate: `vlSelectionTest('brush${k}_store', datum) ? 1 : 0`, as: "in" },
        { joinaggregate: [{ op: "max", field: "in", as: "hit" }], groupby: ["id"] },
        { filter: "datum.hit === 1" },
      ],
      mark: { type: "line", strokeWidth: 1, color: COLORS[k % COLORS.length] },
      encoding: enc,
    });
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: iw, height: ih, padding: { left: MARGIN.left, top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom },
      autosize: "none",
      data: { values: data },
      layer: [
        { params, mark: { type: "line", strokeWidth: 1, color: "#a0a0a0", opacity: 0.3 }, encoding: enc },
        ...Array.from({ length: nGroups }, (_, k) => highlight(k)),
      ],
      config: { axis: { domain: false } },
    };
  }

  function toPixels(domain) {
    const [[x0, yHigh], [x1, yLow]] = domain;
    const sx = view.scale("x");
    const sy = view.scale("y");
    return { x: [sx(x0), sx(x1)], y: [sy(yHigh), sy(yLow)] };
  }

  let extent;
  return {
    async load(d, ext) {
      data = d;
      extent = ext;
    },
    async setGroups(domains) {
      groups = domains.length;
      const res = await vegaEmbed(container, spec(groups, extent), { renderer: "canvas", actions: false });
      view = res.view;
      for (let k = 0; k < groups; k++) {
        const p = toPixels(domains[k]);
        view.signal(`brush${k}_x`, p.x).signal(`brush${k}_y`, p.y);
      }
      await view.runAsync();
    },
    async move(k, domain) {
      const p = toPixels(domain);
      view.signal(`brush${k}_x`, p.x).signal(`brush${k}_y`, p.y);
      await view.runAsync();
    },
    selectedCounts() {
      const sx = view.scale("x");
      const sy = view.scale("y");
      const out = [];
      for (let k = 0; k < groups; k++) {
        const bx = view.signal(`brush${k}_x`).map(sx.invert);
        const by = view.signal(`brush${k}_y`).map(sy.invert);
        const [xl, xh] = [Math.min(...bx), Math.max(...bx)];
        const [yl, yh] = [Math.min(...by), Math.max(...by)];
        const hit = new Set();
        for (const r of data) if (r.xCoord >= xl && r.xCoord <= xh && r.yCoord >= yl && r.yCoord <= yh) hit.add(r.id);
        out.push(hit.size);
      }
      return out;
    },
    breakdown: () => null,
    destroy() {
      if (view) view.finalize();
      container.replaceChildren();
    },
  };
}
```

Use whichever signal names Step 3 confirmed. Mounting happens in `setGroups` because the spec depends on the group count; `loadMs` therefore covers Vega's parse + first render, as it should.

- [ ] **Step 5: Run — expect PASS**

Run: `npx playwright test tests/e2e/bench.spec.js`

- [ ] **Step 6: Commit**

```bash
git add bench/adapters/vegalite.js tests/e2e/bench.spec.js
git commit -m "feat(bench): Vega-Lite baseline"
```

---

### Task 8: server and environment gate

**Files:**
- Create: `bench/server.mjs`, `bench/env.mjs`
- Test: `tests/benchEnv.test.js`

**Interfaces:**
- Produces:
  - `startServer(root, port = 0) -> Promise<{url: string, close(): Promise<void>}>` — 127.0.0.1, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, no directory listing, rejects paths outside `root`.
  - `checkGate({canvas2d, gpuCompositing, visible, focused, crossOriginIsolated}, {allowSoftwareRaster}) -> {ok: boolean, reasons: string[]}` (pure)
  - `collectEnvironment(browser, page, {argv}) -> Promise<object>` (metadata of spec §7)
  - `osRefreshRates() -> Promise<number[]|null>`

- [ ] **Step 1: Failing unit tests**

```js
// tests/benchEnv.test.js
import { checkGate } from "../bench/env.mjs";

const good = { canvas2d: "enabled", gpuCompositing: "enabled", visible: true, focused: true, crossOriginIsolated: true };

test("passes a healthy environment", () => {
  expect(checkGate(good, {})).toEqual({ ok: true, reasons: [] });
});
test("rejects software canvas unless allowed", () => {
  const sw = { ...good, canvas2d: "unavailable_software" };
  expect(checkGate(sw, {}).ok).toBe(false);
  expect(checkGate(sw, { allowSoftwareRaster: true }).ok).toBe(true);
});
test("rejects hidden or unfocused pages", () => {
  expect(checkGate({ ...good, visible: false }, {}).reasons).toContain("page not visible");
  expect(checkGate({ ...good, focused: false }, {}).reasons).toContain("page not focused");
});
test("rejects coarse timers", () => {
  expect(checkGate({ ...good, crossOriginIsolated: false }, {}).ok).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx jest tests/benchEnv.test.js`

- [ ] **Step 3: `bench/env.mjs`**

```js
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const run = promisify(execFile);

export function checkGate(s, { allowSoftwareRaster = false } = {}) {
  const reasons = [];
  if (!allowSoftwareRaster && s.canvas2d !== "enabled") reasons.push(`2d_canvas is ${s.canvas2d}`);
  if (!allowSoftwareRaster && s.gpuCompositing !== "enabled") reasons.push(`gpu_compositing is ${s.gpuCompositing}`);
  if (!s.visible) reasons.push("page not visible");
  if (!s.focused) reasons.push("page not focused");
  if (!s.crossOriginIsolated) reasons.push("page not cross-origin isolated (coarse timers)");
  return { ok: reasons.length === 0, reasons };
}

export async function osRefreshRates() {
  try {
    if (process.platform === "darwin") {
      const js = 'ObjC.import("AppKit"); const s=$.NSScreen.screens; const r=[]; for (let i=0;i<s.count;i++) r.push(Number(s.objectAtIndex(i).maximumFramesPerSecond)); JSON.stringify(r)';
      const { stdout } = await run("osascript", ["-l", "JavaScript", "-e", js]);
      return JSON.parse(stdout.trim());
    }
    if (process.platform === "win32") {
      const { stdout } = await run("powershell", ["-NoProfile", "-Command",
        "(Get-CimInstance Win32_VideoController | Where-Object CurrentRefreshRate).CurrentRefreshRate -join ','"]);
      return stdout.trim().split(",").filter(Boolean).map(Number);
    }
    const { stdout } = await run("xrandr", ["--current"]);
    return [...stdout.matchAll(/([\d.]+)\*/g)].map((m) => Number(m[1]));
  } catch {
    return null;
  }
}

async function gitInfo() {
  try {
    const sha = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
    const dirty = (await run("git", ["status", "--porcelain", "--", "src", "bench"])).stdout.trim() !== "";
    return { sha, dirty };
  } catch {
    return { sha: null, dirty: null };
  }
}

const pkgVersion = (name) => {
  try {
    return JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url))).version;
  } catch {
    return null;
  }
};

export async function gpuStatus(browser) {
  const cdp = await browser.newBrowserCDPSession();
  const info = await cdp.send("SystemInfo.getInfo");
  await cdp.detach();
  const fs = info.gpu.featureStatus || {};
  return {
    canvas2d: fs["2d_canvas"], gpuCompositing: fs.gpu_compositing, featureStatus: fs,
    devices: info.gpu.devices, driverBugWorkarounds: (info.gpu.driverBugWorkarounds || []).length,
    modelName: info.modelName, modelVersion: info.modelVersion,
  };
}

export async function collectEnvironment(browser, page, { argv }) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const ua = await page.evaluate(() => ({ ua: navigator.userAgent, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency }));
  return {
    timestamp: new Date().toISOString(),
    argv,
    os: { platform: process.platform, release: os.release(), version: os.version(), arch: os.arch() },
    cpu: { model: os.cpus()[0] && os.cpus()[0].model, cores: os.cpus().length },
    ramGB: Math.round(os.totalmem() / 2 ** 30),
    loadAvg: os.loadavg(),
    hostname: os.hostname(),
    gpu: await gpuStatus(browser),
    refreshRatesHz: await osRefreshRates(),
    browser: { version: browser.version(), userAgent: ua.ua },
    page: { nativeDpr: ua.dpr, hardwareConcurrency: ua.cores },
    versions: {
      node: process.version, timewidget: pkg.version, playwright: pkgVersion("playwright"),
      d3: pkgVersion("d3"), vega: pkgVersion("vega"), vegaLite: pkgVersion("vega-lite"),
    },
    git: await gitInfo(),
  };
}
```

`page.nativeDpr` is the forced value (1) because of `deviceScaleFactor`; also record the OS scale on macOS via the same JXA call (`backingScaleFactor`) if needed later — not required by the spec.

- [ ] **Step 4: `bench/server.mjs`**

```js
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".map": "application/json" };

export function startServer(root, port = 0) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const file = path.resolve(base, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(base + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    let st;
    try {
      st = statSync(file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    if (!st.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cache-Control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address();
      resolve({ url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
```

- [ ] **Step 5: Run unit tests — expect PASS.** `npx jest tests/benchEnv.test.js`

- [ ] **Step 6: Commit**

```bash
git add bench/env.mjs bench/server.mjs tests/benchEnv.test.js
git commit -m "feat(bench): isolated local server and environment gate"
```

---

### Task 9: `bench/run.mjs` CLI and `npm run bench`

**Files:**
- Create: `bench/run.mjs`, `bench/results/.gitignore`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: everything above.
- CLI: `node bench/run.mjs [--quick] [--reps 5] [--adapters a,b] [--lines 1000,...] [--frames 300] [--warmup 60] [--seed 1] [--channel chrome] [--allow-software-raster] [--resume <file.jsonl>] [--out bench/results]`.
- Output: `<out>/<host>-<YYYYMMDD-HHmm>.jsonl` (first line `{type:"environment", ...}`, then one `{type:"run", cell, rep, ...RunResult}` per run, `{type:"skip"|"reject", ...}` lines), and at the end `<same>.csv` (aggregated, `SHEET_COLUMNS`) and `<same>.summary.json` (cells + N₆₀/N₃₀/N₁₀₀ + linear fit per series).

- [ ] **Step 1: Write `bench/run.mjs`**

```js
#!/usr/bin/env node
import { chromium } from "playwright";
import { parseArgs } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";
import { collectEnvironment, gpuStatus, checkGate } from "./env.mjs";
import { buildCells, orderRuns, shouldSkip, pendingRuns, seriesKey, cellKey } from "./plan.mjs";
import { aggregateCell, SHEET_COLUMNS, toSheetRow, thresholdCrossing, linearFit } from "./stats.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: opt } = parseArgs({
  options: {
    quick: { type: "boolean", default: false },
    reps: { type: "string" },
    adapters: { type: "string" },
    lines: { type: "string" },
    frames: { type: "string", default: "300" },
    warmup: { type: "string", default: "60" },
    seed: { type: "string", default: "1" },
    channel: { type: "string" },
    "allow-software-raster": { type: "boolean", default: false },
    resume: { type: "string" },
    out: { type: "string", default: path.join(ROOT, "bench", "results") },
  },
});

const list = (s, f = Number) => s.split(",").map((x) => f(x.trim()));
const config = opt.quick
  ? { adapters: ["timewidget"], lines: [1000, 10000, 50000], mainPoints: 20, sweepLines: 5000, sweepPoints: [], groups: [1], reps: 2 }
  : { adapters: ["timewidget", "canvas", "svg", "vegalite"], lines: [1000, 2000, 5000, 10000, 20000, 50000, 100000],
      mainPoints: 20, sweepLines: 5000, sweepPoints: [100, 500], groups: [1, 3], reps: 5 };
if (opt.adapters) config.adapters = list(opt.adapters, String);
if (opt.lines) config.lines = list(opt.lines);
if (opt.reps) config.reps = Number(opt.reps);
const frames = Number(opt.frames);
const warmupFrames = Number(opt.warmup);
const VSYNC_OFF = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const outFile = opt.resume || path.join(opt.out, `${os.hostname()}-${stamp}.jsonl`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const readRecords = () =>
  fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const write = (rec) => fs.appendFileSync(outFile, JSON.stringify(rec) + "\n");

async function launch() {
  const browser = await chromium.launch({ headless: false, channel: opt.channel, args: [...VSYNC_OFF, "--window-size=1300,950"] });
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  return { browser, page };
}

async function pageState(page) {
  return page.evaluate(() => ({ visible: document.visibilityState === "visible", focused: document.hasFocus(), crossOriginIsolated: window.crossOriginIsolated }));
}

async function main() {
  const server = await startServer(ROOT);
  const pageUrl = `${server.url}/bench/page.html`;
  try {
    // Environment + preflight equivalence in one browser.
    const first = await launch();
    await first.page.goto(pageUrl);
    await first.page.waitForFunction(() => typeof window.benchCell === "function");
    await first.page.bringToFront();
    const gpu = await gpuStatus(first.browser);
    const gate = checkGate({ ...gpu, ...(await pageState(first.page)) }, { allowSoftwareRaster: opt["allow-software-raster"] });
    if (!gate.ok) throw new Error("Environment rejected: " + gate.reasons.join("; "));
    if (!readRecords().length) {
      write({ type: "environment", softwareRaster: opt["allow-software-raster"], config, frames, warmupFrames,
        ...(await collectEnvironment(first.browser, first.page, { argv: process.argv.slice(2) })) });
    }
    for (const groups of config.groups) {
      const pre = await first.page.evaluate((o) => window.benchPreflight(o), { adapters: config.adapters, lines: 1000, points: 20, groups });
      const ref = JSON.stringify(pre.timewidget);
      for (const name of ["canvas", "svg"]) {
        if (pre[name] && JSON.stringify(pre[name]) !== ref) throw new Error(`Preflight: ${name} selection differs from TimeWidget (groups=${groups})`);
      }
      write({ type: "preflight", groups, counts: pre });
    }
    // Discarded warm-up cell (thermal/JIT/disk caches).
    await first.page.evaluate((o) => window.benchCell(o), { adapter: config.adapters[0], lines: config.lines[0], points: 20, groups: 1, frames, warmupFrames });
    await first.browser.close();

    const ordered = orderRuns(buildCells(config), config.reps, Number(opt.seed));
    const todo = pendingRuns(ordered, readRecords().filter((r) => r.type === "run"));
    console.log(`${todo.length} runs to do -> ${outFile}`);
    let i = 0;
    for (const { cell, rep } of todo) {
      i++;
      const completed = readRecords().filter((r) => r.type === "run");
      if (shouldSkip(cell, completed)) {
        write({ type: "skip", cell, rep });
        continue;
      }
      const { browser, page } = await launch();
      try {
        await page.goto(pageUrl);
        await page.waitForFunction(() => typeof window.benchCell === "function");
        await page.bringToFront();
        const before = checkGate({ ...(await gpuStatus(browser)), ...(await pageState(page)) }, { allowSoftwareRaster: opt["allow-software-raster"] });
        if (!before.ok) {
          write({ type: "reject", cell, rep, reasons: before.reasons });
          console.warn(`reject ${cellKey(cell)}#${rep}: ${before.reasons.join("; ")}`);
          continue;
        }
        const result = await page.evaluate((o) => window.benchCell(o), { ...cell, frames, warmupFrames });
        if (!result.visible || !result.focused) {
          write({ type: "reject", cell, rep, reasons: ["lost visibility/focus during run"] });
          continue;
        }
        write({ type: "run", cell, rep, ...result });
        console.log(`[${i}/${todo.length}] ${cellKey(cell)} rep ${rep}: p50 ${result.frameMs.p50.toFixed(2)} ms, p95 ${result.frameMs.p95.toFixed(2)} ms${result.truncated ? " (truncated)" : ""}`);
      } finally {
        await browser.close();
      }
    }
    writeSummary();
  } finally {
    await server.close();
  }
}

function writeSummary() {
  const runs = readRecords().filter((r) => r.type === "run");
  const byCell = new Map();
  for (const r of runs) {
    const k = cellKey(r.cell);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(r);
  }
  const cells = [...byCell.values()].map(aggregateCell);
  const csv = [SHEET_COLUMNS, ...cells.map(toSheetRow)]
    .map((row) => row.map((v) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","))
    .join("\n");
  const base = outFile.replace(/\.jsonl$/, "");
  fs.writeFileSync(base + ".csv", csv + "\n");
  const series = new Map();
  for (const c of cells) {
    const k = seriesKey(c);
    if (!series.has(k)) series.set(k, []);
    series.get(k).push(c);
  }
  const scaling = [...series.entries()].map(([k, cs]) => {
    const pts = cs.map((c) => ({ n: c.lines, ms: c.frameMs.p95 }));
    const fit = cs.length >= 3 ? linearFit(cs.map((c) => c.lines * c.points), cs.map((c) => c.frameMs.p50)) : null;
    return { series: k, n60: thresholdCrossing(pts, 1000 / 60), n30: thresholdCrossing(pts, 1000 / 30), n100: thresholdCrossing(pts, 100),
      msPer100kPoints: fit ? fit.slope * 1e5 : null, r2: fit ? fit.r2 : null };
  });
  fs.writeFileSync(base + ".summary.json", JSON.stringify({ cells, scaling }, null, 2));
  console.log(`wrote ${base}.csv and ${base}.summary.json`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
```

The fit is `null` for series with fewer than 3 sizes (e.g. the points sweep), where a slope is meaningless.

- [ ] **Step 2: `bench/results/.gitignore`**

```
*
!.gitignore
!paper/
!paper/**
```

- [ ] **Step 3: `package.json` script**

`"bench": "npm run build && node bench/run.mjs"` — options pass through as `npm run bench -- --quick`.

- [ ] **Step 4: Verify end to end with `--quick` (headed, ~3 min)**

Run: `npm run bench -- --quick --reps 1 --lines 1000,10000`
Expected: preflight passes, 2 runs logged, `.jsonl`, `.csv`, `.summary.json` written under `bench/results/`; the CSV's first 21 header cells equal the spreadsheet's.

- [ ] **Step 5: Verify resume:** run a full-adapter command, Ctrl-C after 2 runs, re-run with `--resume <that file>`; expect "N-2 runs to do".

- [ ] **Step 6: Commit**

```bash
git add bench/run.mjs bench/results/.gitignore package.json package-lock.json
git commit -m "feat(bench): npm run bench CLI with resume, gate and CSV output"
```

---

### Task 10: README, CLAUDE.md note and validation runs

**Files:**
- Create: `bench/README.md`
- Modify: `CLAUDE.md` (one short "Benchmark" subsection under Build, test, run)

- [ ] **Step 1: `bench/README.md`** — prerequisites (`npm ci`, `npx playwright install chromium`), the one command, "don't touch the machine; plug in power; close other apps", what the gate rejects and why, where results go, how to resume, what to send back (the `.jsonl` file), `--allow-software-raster` meaning, how the CSV maps onto `rendimiento_TimeWidget.xlsx`.

- [ ] **Step 2: CLAUDE.md** — add: `npm run bench` is headed, takes 2–3 h, never runs in CI; frame time is vsync-off; default headless is software raster.

- [ ] **Step 3: Validation (spec §9), recorded in the PR description:**
  1. Two-monitor replication: `--quick` with the window on each display (`--window-position`), frame p50 within 5%.
  2. Trace cross-check: for 1k/10k/50k, record a CDP trace (`browser.startTracing(page, {categories: ["devtools.timeline", "disabled-by-default-devtools.timeline.frame"]})`) and compare presented-frame intervals against driver frame times.
  3. Manual `example/Performance.html` (vsync on) vs. `timewidget` adapter TotalCpuMs at 10k lines on this machine.

- [ ] **Step 4: Full test gate:** `npm run test:all` and `npx eslint src/ bench/` (only the six known pre-existing `no-unused-vars` in `src/`).

- [ ] **Step 5: Commit and open PR** (only when the user asks to push):

```bash
git add bench/README.md CLAUDE.md
git commit -m "docs(bench): co-author instructions and agent guide note"
```
