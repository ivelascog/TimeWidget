export let PERFORMANCELOG = false;

let options = {
  maxSamples: 300,
  reportEvery: 60,
  log: true,
  onReport: null,
};
let completedFrames = 0;
let metrics = createEmptyMetrics();

function createEmptyMetrics() {
  return { collision: [], render: [], totalCpu: [], frame: [] };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addMetric(name, value) {
  metrics[name].push(value);
  while (metrics[name].length > options.maxSamples) metrics[name].shift();
}

export function configurePerformance(nextOptions = {}) {
  if (typeof nextOptions === "boolean") nextOptions = { enabled: nextOptions };
  PERFORMANCELOG =
    nextOptions.enabled === undefined ? true : nextOptions.enabled;
  if (Number.isInteger(nextOptions.maxSamples) && nextOptions.maxSamples > 0) {
    options.maxSamples = nextOptions.maxSamples;
    for (const values of Object.values(metrics)) {
      while (values.length > options.maxSamples) values.shift();
    }
  }
  if (Number.isInteger(nextOptions.reportEvery) && nextOptions.reportEvery > 0) {
    options.reportEvery = nextOptions.reportEvery;
  }
  if (nextOptions.log !== undefined) options.log = nextOptions.log;
  if (nextOptions.onReport !== undefined) options.onReport = nextOptions.onReport;
}

export function resetPerformanceMetrics() {
  metrics = createEmptyMetrics();
  completedFrames = 0;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return (
    sortedValues[lower] +
    (sortedValues[upper] - sortedValues[lower]) * (index - lower)
  );
}

export function summarizePerformanceValues(values) {
  if (!values.length) {
    return { samples: 0, mean: null, p50: null, p95: null, p99: null };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    samples: values.length,
    mean: average(values),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function reciprocal(value) {
  return value && value > 0 ? 1000 / value : null;
}

export function summarizePerformanceMetrics(sourceMetrics) {
  const frameMs = summarizePerformanceValues(sourceMetrics.frame);
  return {
    // Sustained FPS is total frames / total time, equivalently the reciprocal
    // of the mean frame duration. p5 and p1 describe the slow tail and map to
    // frame-time p95 and p99 respectively.
    fps: {
      samples: frameMs.samples,
      mean: reciprocal(frameMs.mean),
      p50: reciprocal(frameMs.p50),
      p5: reciprocal(frameMs.p95),
      p1: reciprocal(frameMs.p99),
    },
    frameMs,
    collisionMs: summarizePerformanceValues(sourceMetrics.collision),
    renderMs: summarizePerformanceValues(sourceMetrics.render),
    totalCpuMs: summarizePerformanceValues(sourceMetrics.totalCpu),
  };
}

export function getPerformanceReport() {
  return summarizePerformanceMetrics(metrics);
}

export function startPerformanceMeasurement() {
  const now = performance.now();
  return { startedAt: now, selectionStartedAt: now };
}

export function finishSelectionMeasurement(measurement) {
  if (!measurement) return;
  measurement.selectionEndedAt = performance.now();
  addMetric(
    "collision",
    measurement.selectionEndedAt - measurement.selectionStartedAt
  );
}

export function startRenderMeasurement(measurement) {
  if (measurement) measurement.renderStartedAt = performance.now();
}

export function finishRenderMeasurement(measurement) {
  if (!measurement || measurement.renderStartedAt === undefined) return;
  addMetric("render", performance.now() - measurement.renderStartedAt);
}

export function finishPerformanceMeasurement(measurement) {
  if (!measurement) return;
  addMetric("totalCpu", performance.now() - measurement.startedAt);

  window.requestAnimationFrame(() => {
    addMetric("frame", performance.now() - measurement.startedAt);
    completedFrames++;
    if (completedFrames % options.reportEvery !== 0) return;
    const report = getPerformanceReport();
    if (options.log) console.table(report);
    if (typeof options.onReport === "function") options.onReport(report);
  });
}
