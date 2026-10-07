import {
  percentile,
  summarize,
  bootstrapCI,
  thresholdCrossing,
  linearFit,
  SHEET_COLUMNS,
  toSheetRow,
  aggregateCell,
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
    frameMs: frame, frameP50CI: [9, 11], frameP95CI: [18, 22],
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

test("aggregateCell leaves the breakdown empty for baselines", () => {
  const cell = { adapter: "svg", lines: 1000, points: 20, groups: 1 };
  const r = { cell, frameMs: frame, collisionMs: null, renderMs: null, totalCpuMs: null, loadMs: 1, truncated: true };
  const a = aggregateCell([r, r]);
  expect(a.collisionMs).toBeNull();
  expect(a.truncated).toBe(true);
});
