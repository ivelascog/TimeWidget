import {
  configurePerformance,
  getPerformanceReport,
  resetPerformanceMetrics,
  startPerformanceMeasurement,
} from "./PerformanceMonitor.js";

function firstCommittedBrush(brushes) {
  for (const group of brushes.getBrushesGroup().values()) {
    for (const brush of group.brushes) return brush;
  }
  return null;
}

export default function createPerformanceBenchmark({
  getBrushes,
  getExtent,
  render,
  options,
}) {
  if (options !== undefined) configurePerformance(options);

  function run({ frames = 300, warmupFrames = 60 } = {}) {
    const frameCount = Math.max(1, Math.floor(frames));
    const warmupCount = Math.max(0, Math.floor(warmupFrames));
    configurePerformance({ enabled: false });
    resetPerformanceMetrics();
    let warmupIndex = 0;
    let measuredIndex = 0;

    return new Promise((resolve) => {
      function renderFrame() {
        if (warmupIndex < warmupCount) {
          warmupIndex++;
          render(null);
          window.requestAnimationFrame(renderFrame);
          return;
        }
        if (measuredIndex === 0) {
          configurePerformance({ enabled: true });
          resetPerformanceMetrics();
        }
        if (measuredIndex++ >= frameCount) {
          window.requestAnimationFrame(() => resolve(getPerformanceReport()));
          return;
        }
        render(startPerformanceMeasurement());
        window.requestAnimationFrame(renderFrame);
      }
      window.requestAnimationFrame(renderFrame);
    });
  }

  function runBrush({
    frames = 300,
    warmupFrames = 60,
    cycles = 3,
    brushHeight = 0.25,
  } = {}) {
    const brushes = getBrushes();
    const frameCount = Math.max(1, Math.floor(frames));
    const warmupCount = Math.max(0, Math.floor(warmupFrames));
    const cycleCount = Math.max(0.5, Number(cycles) || 3);
    const extent = getExtent();
    const xMin = +extent.x[0];
    const xMax = +extent.x[1];
    const yMin = +extent.y[0];
    const yMax = +extent.y[1];
    const brushWidth = (xMax - xMin) * 0.2;
    const heightRatio = Math.max(0.05, Math.min(1, Number(brushHeight) || 0.25));
    const height = (yMax - yMin) * heightRatio;
    const yHigh = (yMin + yMax + height) / 2;
    const yLow = yHigh - height;
    const asX = (value) =>
      extent.x[0] instanceof Date ? new Date(value) : value;

    configurePerformance({ enabled: false });
    brushes.addFilters(
      [
        {
          name: "Performance benchmark",
          isEnable: true,
          isActive: true,
          brushes: [
            {
              selectionDomain: [
                [asX(xMin), yHigh],
                [asX(xMin + brushWidth), yLow],
              ],
            },
          ],
        },
      ],
      true
    );

    const brush = firstCommittedBrush(brushes);
    resetPerformanceMetrics();
    let index = 0;
    const totalFrames = warmupCount + frameCount;

    return new Promise((resolve) => {
      function moveFrame() {
        if (index === warmupCount) {
          configurePerformance({ enabled: true });
          resetPerformanceMetrics();
        }
        if (index >= totalFrames) {
          window.requestAnimationFrame(() => resolve(getPerformanceReport()));
          return;
        }
        const progress = totalFrames === 1 ? 0.5 : (index + 1) / totalFrames;
        const phase = (progress * cycleCount * 2) % 2;
        const triangle = phase <= 1 ? phase : 2 - phase;
        const x0 = xMin + (xMax - xMin - brushWidth) * triangle;
        brushes.moveBrush(brush, [
          [asX(x0), yHigh],
          [asX(x0 + brushWidth), yLow],
        ]);
        index++;
        window.requestAnimationFrame(moveFrame);
      }
      window.requestAnimationFrame(moveFrame);
    });
  }

  return {
    configure: configurePerformance,
    reset: resetPerformanceMetrics,
    report: getPerformanceReport,
    run,
    runBrush,
  };
}
