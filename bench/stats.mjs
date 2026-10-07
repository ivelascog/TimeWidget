// Pure statistics for the benchmark: per-run summaries (also used in the
// browser), cross-run aggregation, scaling metrics and spreadsheet rows.
import { mulberry32 } from "./workload.js";

// Same linear interpolation as src/PerformanceMonitor.js, so numbers stay
// comparable with the existing in-widget monitor.
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

export function summarize(values) {
  if (!values || !values.length) {
    return { samples: 0, mean: null, p50: null, p95: null, p99: null };
  }
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

// Percentile bootstrap CI of the median, seeded so reruns give the same file.
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
// the last size under and the first size over. Censored when never crossed:
// the true crossing lies beyond the largest size measured.
export function thresholdCrossing(points, thresholdMs) {
  const pts = points.slice().sort((a, b) => a.n - b.n);
  if (!pts.length || pts[0].ms > thresholdMs) return { n: null, censored: false };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ms > thresholdMs) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (Math.log(thresholdMs) - Math.log(a.ms)) / (Math.log(b.ms) - Math.log(a.ms));
      const logN = Math.log(a.n) + t * (Math.log(b.n) - Math.log(a.n));
      return { n: Math.round(Math.exp(logN)), censored: false };
    }
  }
  return { n: pts[pts.length - 1].n, censored: true };
}

export function linearFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

// The headline frame time of a run. When frames were dropped (fewer swaps
// than frames produced), the interval between frames that reached the screen;
// otherwise the in-page clock. See trace.mjs for why they differ (SVG drops
// frames without blocking the main thread). Swaps can also outnumber frames
// (the display re-swaps without new content when frames take ~1-3 ms); those
// extra swaps carry nothing new, so they must not shorten the headline.
export const DROPPED_FRAMES_RATIO = 0.95;

export function headlineMs(run) {
  const dropped =
    run.presentedMs && run.presentedMs.samples && run.presentedRatio !== null && run.presentedRatio < DROPPED_FRAMES_RATIO;
  return dropped ? run.presentedMs : run.frameMs;
}

const STATS = ["mean", "p50", "p95", "p99"];
const metricCols = (name) => STATS.map((s) => `${name} ${s}`);

// The first 21 columns are exactly the paper spreadsheet's, so a CSV row can
// be pasted into rendimiento_TimeWidget.xlsx.
export const SHEET_COLUMNS = [
  "Número de líneas",
  "FPS mean",
  "FPS p50",
  "FPS p5",
  "FPS p1",
  ...metricCols("FrameMs"),
  ...metricCols("CollisionMs"),
  ...metricCols("RenderMs"),
  ...metricCols("TotalCpuMs"),
  "Adapter",
  "Points per line",
  "Brush groups",
  "Runs",
  "FrameMs p50 CI low",
  "FrameMs p50 CI high",
  "FrameMs p95 CI low",
  "FrameMs p95 CI high",
  "LoadMs",
  "Truncated",
  ...metricCols("MainThreadMs"),
  "Presented ratio",
];

const fps = (ms) => (ms && ms > 0 ? 1000 / ms : "");
const cols = (m) => (m ? STATS.map((s) => m[s]) : STATS.map(() => ""));

export function toSheetRow(c) {
  const f = c.frameMs;
  return [
    c.lines,
    fps(f.mean),
    fps(f.p50),
    fps(f.p95),
    fps(f.p99),
    ...cols(f),
    ...cols(c.collisionMs),
    ...cols(c.renderMs),
    ...cols(c.totalCpuMs),
    c.adapter,
    c.points,
    c.groups,
    c.runs,
    c.frameP50CI[0],
    c.frameP50CI[1],
    c.frameP95CI[0],
    c.frameP95CI[1],
    c.loadMs,
    c.truncated,
    ...cols(c.mainThreadMs),
    c.presentedRatio === null || c.presentedRatio === undefined ? "" : c.presentedRatio,
  ];
}

const medianOf = (runs, get) => {
  const v = runs.map(get).filter((x) => x !== null && x !== undefined);
  return v.length ? median(v) : null;
};

const medianSummary = (runs, get) =>
  runs.every((r) => get(r))
    ? Object.fromEntries(["samples", ...STATS].map((s) => [s, medianOf(runs, (r) => get(r)[s])]))
    : null;

// runs: run records of one cell (driver.js runCell results plus {cell} and,
// from run.mjs, presentedMs/presentedRatio).
export function aggregateCell(runs) {
  const { adapter, lines, points, groups } = runs[0].cell;
  return {
    adapter,
    lines,
    points,
    groups,
    runs: runs.length,
    frameMs: medianSummary(runs, headlineMs),
    frameP50CI: bootstrapCI(runs.map((r) => headlineMs(r).p50)),
    frameP95CI: bootstrapCI(runs.map((r) => headlineMs(r).p95)),
    mainThreadMs: medianSummary(runs, (r) => r.frameMs),
    presentedRatio: medianOf(runs, (r) => r.presentedRatio),
    collisionMs: medianSummary(runs, (r) => r.collisionMs),
    renderMs: medianSummary(runs, (r) => r.renderMs),
    totalCpuMs: medianSummary(runs, (r) => r.totalCpuMs),
    loadMs: medianOf(runs, (r) => r.loadMs),
    truncated: runs.some((r) => r.truncated),
  };
}
