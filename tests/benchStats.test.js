import {
  percentile,
  summarize,
  bootstrapCI,
  thresholdCrossing,
  linearFit,
  SHEET_COLUMNS,
  toSheetRow,
  aggregateCell,
  headlineMs,
  scalingSummary,
} from "../bench/stats.mjs";

test("percentile interpolates like PerformanceMonitor", () => {
  expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  expect(percentile([10], 0.95)).toBe(10);
  expect(percentile([], 0.5)).toBeNull();
});

test("summarize", () => {
  expect(summarize([4, 1, 3, 2])).toMatchObject({ samples: 4, mean: 2.5, p50: 2.5 });
  expect(summarize([]).samples).toBe(0);
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
    { n: 1000, ms: 2 },
    { n: 10000, ms: 10 },
    { n: 20000, ms: 20 },
    { n: 50000, ms: 60 },
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

const frame = { samples: 5, mean: 10, p50: 10, p95: 20, p99: 25 };

test("sheet columns start with the spreadsheet's", () => {
  expect(SHEET_COLUMNS.slice(0, 21)).toEqual([
    "Número de líneas",
    "FPS mean", "FPS p50", "FPS p5", "FPS p1",
    "FrameMs mean", "FrameMs p50", "FrameMs p95", "FrameMs p99",
    "CollisionMs mean", "CollisionMs p50", "CollisionMs p95", "CollisionMs p99",
    "RenderMs mean", "RenderMs p50", "RenderMs p95", "RenderMs p99",
    "TotalCpuMs mean", "TotalCpuMs p50", "TotalCpuMs p95", "TotalCpuMs p99",
  ]);
  const row = toSheetRow({
    adapter: "canvas", lines: 1000, points: 20, groups: 1, runs: 5,
    frameMs: frame, mainThreadMs: frame, presentedRatio: null, frameP50CI: [9, 11], frameP95CI: [18, 22],
    collisionMs: null, renderMs: null, totalCpuMs: null, loadMs: 50, truncated: false,
  });
  expect(row[0]).toBe(1000);
  expect(row[1]).toBe(100); // FPS mean = 1000 / frame mean
  expect(row[3]).toBe(50); // FPS p5 = 1000 / frame p95
  expect(row[9]).toBe(""); // baselines have no collision breakdown
  expect(row).toHaveLength(SHEET_COLUMNS.length);
});

test("aggregateCell takes the median of each statistic across runs", () => {
  const cell = { adapter: "timewidget", lines: 1000, points: 20, groups: 1 };
  const run = (p50) => ({
    cell, frameMs: { ...frame, p50 }, collisionMs: frame, renderMs: frame, totalCpuMs: frame,
    loadMs: 100, truncated: false,
  });
  const a = aggregateCell([run(8), run(10), run(30)]);
  expect(a.frameMs.p50).toBe(10);
  expect(a.runs).toBe(3);
  expect(a.collisionMs.p95).toBe(20);
  expect(a.frameP50CI[0]).toBeLessThanOrEqual(10);
});

test("per-frame stage cost is the headline when the trace recorded it", () => {
  // SVG at 5k series: the page's clock says 1.1 ms, but the GPU needs 2.5 ms
  // per frame; the slower stage is what a paced pipeline can sustain.
  const cell = { adapter: "svg", lines: 5000, points: 20, groups: 1 };
  const cost = { samples: 300, mean: 2.5, p50: 2.5, p95: 3, p99: 3.2 };
  const gpu = { samples: 300, mean: 2.5, p50: 2.5, p95: 3, p99: 3.2 };
  const r = {
    cell, frameMs: frame, frameCostMs: cost, gpuMs: gpu, bottleneck: "gpuMain", paceMs: 10,
    presentedRatio: 1, presentedFrames: 300,
    collisionMs: null, renderMs: null, totalCpuMs: null, loadMs: 1, truncated: false,
  };
  expect(headlineMs(r)).toBe(cost);
  expect(headlineMs({ ...r, frameCostMs: undefined })).toBe(frame);
  const a = aggregateCell([r, r, r]);
  expect(a.frameMs.p50).toBe(2.5);
  expect(a.mainThreadMs.p50).toBe(10);
  expect(a.gpuMs.p95).toBe(3);
  expect(a.bottleneck).toBe("gpuMain");
  expect(a.paceMs).toBe(10);
  const row = toSheetRow(a);
  expect(row[SHEET_COLUMNS.indexOf("FrameMs p50")]).toBe(2.5);
  expect(row[SHEET_COLUMNS.indexOf("MainThreadMs p50")]).toBe(10);
  expect(row[SHEET_COLUMNS.indexOf("GpuMs p95")]).toBe(3);
  expect(row[SHEET_COLUMNS.indexOf("Bottleneck")]).toBe("gpuMain");
  expect(row[SHEET_COLUMNS.indexOf("PaceMs")]).toBe(10);
  expect(row[SHEET_COLUMNS.indexOf("Presented ratio")]).toBe(1);
});

test("aggregateCell leaves the breakdown empty for baselines", () => {
  const cell = { adapter: "svg", lines: 1000, points: 20, groups: 1 };
  const r = { cell, frameMs: frame, collisionMs: null, renderMs: null, totalCpuMs: null, loadMs: 1, truncated: true };
  const a = aggregateCell([r, r]);
  expect(a.collisionMs).toBeNull();
  expect(a.truncated).toBe(true);
});

describe("scalingSummary", () => {
  const cell = (lines, p50, p95, extra = {}) => ({
    adapter: "svg", lines, points: 20, groups: 1,
    frameMs: { samples: 300, mean: p50, p50, p95, p99: p95 }, truncated: false, ...extra,
  });

  test("fits a line and finds threshold crossings", () => {
    const [s] = scalingSummary([cell(1000, 1, 2), cell(10000, 10, 12), cell(20000, 20, 24)]);
    expect(s.series).toBe("svg|20|1");
    expect(s.r2).toBeCloseTo(1);
    expect(s.n30).toEqual({ n: 20000, censored: true });
    expect(s.n60.censored).toBe(false);
  });

  // Review finding: a cell with no measured frames (budget spent in warm-up)
  // had null stats; null > 100 is false, so it read as "never crossed".
  test("a cell with no frames or a truncated cell counts as over every threshold", () => {
    const empty = cell(50000, null, null);
    const [s] = scalingSummary([cell(1000, 1, 2), cell(10000, 10, 12), cell(20000, 20, 24), empty]);
    // Unknown cost at 50k: the honest answer is the last size that passed.
    expect(s.n100).toEqual({ n: 20000, censored: false });
    expect(s.r2).toBeCloseTo(1); // and it is left out of the fit
    const [t] = scalingSummary([cell(1000, 1, 2), cell(10000, 10, 12), cell(20000, 20, 24), cell(50000, 30, 40, { truncated: true })]);
    expect(t.n100.censored).toBe(false);
  });
});
