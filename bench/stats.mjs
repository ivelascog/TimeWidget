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

// The headline frame time of a run: each paced frame's slowest pipeline
// stage, when the trace recorded it (see trace.mjs); else the page's clock.
export function headlineMs(run) {
  return run.frameCostMs && run.frameCostMs.samples ? run.frameCostMs : run.frameMs;
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
  "Presented frames",
  ...metricCols("GpuMs"),
  "Bottleneck",
  "PaceMs",
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
    c.presentedFrames === null || c.presentedFrames === undefined ? "" : c.presentedFrames,
    ...cols(c.gpuMs),
    c.bottleneck || "",
    c.paceMs === null || c.paceMs === undefined ? "" : c.paceMs,
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

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best;
}

// runs: run records of one cell (driver.js runCell results plus {cell} and,
// from run.mjs, frameCostMs/gpuMs/bottleneck/paceMs/presentedRatio).
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
    presentedFrames: medianOf(runs, (r) => r.presentedFrames),
    gpuMs: medianSummary(runs, (r) => r.gpuMs),
    bottleneck: mostCommon(runs.map((r) => r.bottleneck).filter(Boolean)),
    paceMs: runs.some((r) => r.paceMs !== undefined) ? Math.max(...runs.map((r) => r.paceMs || 0)) : null,
    collisionMs: medianSummary(runs, (r) => r.collisionMs),
    renderMs: medianSummary(runs, (r) => r.renderMs),
    totalCpuMs: medianSummary(runs, (r) => r.totalCpuMs),
    loadMs: medianOf(runs, (r) => r.loadMs),
    truncated: runs.some((r) => r.truncated),
  };
}

// Per series (adapter, points, groups): threshold crossings on p95 and a linear
// fit of p50 against total points. A cell that was truncated or has no frames
// has an unknown, too-high cost: it counts as over every threshold (so the
// crossing is the last size that passed) and is left out of the fit.
export function scalingSummary(cells) {
  const series = new Map();
  for (const c of cells) {
    const k = `${c.adapter}|${c.points}|${c.groups}`;
    if (!series.has(k)) series.set(k, []);
    series.get(k).push(c);
  }
  return [...series.entries()].map(([k, cs]) => {
    const known = (c) => !c.truncated && c.frameMs && c.frameMs.p95 !== null && c.frameMs.p50 !== null;
    const pts = cs.map((c) => ({ n: c.lines, ms: known(c) ? c.frameMs.p95 : Infinity }));
    const fitCells = cs.filter(known);
    const fit =
      fitCells.length >= 3
        ? linearFit(fitCells.map((c) => c.lines * c.points), fitCells.map((c) => c.frameMs.p50))
        : null;
    return {
      series: k,
      n60: thresholdCrossing(pts, 1000 / 60),
      n30: thresholdCrossing(pts, 1000 / 30),
      n100: thresholdCrossing(pts, 100),
      msPer100kPoints: fit ? fit.slope * 1e5 : null,
      r2: fit ? fit.r2 : null,
    };
  });
}
