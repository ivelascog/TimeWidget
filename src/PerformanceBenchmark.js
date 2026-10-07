import {
  configurePerformance,
  getPerformanceReport,
  resetPerformanceMetrics,
  startPerformanceMeasurement,
} from "./PerformanceMonitor.js";

// The committed brush of each group, in group order. Every benchmark group
// holds exactly one brush, so the first entry is the one we created.
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

  // Replaces every brush group with one group per domain, and returns a handle
  // that moves a group's brush exactly as runBrush does. Lets an external
  // driver (bench/) step TimeWidget frame by frame.
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

  function runBrush({
    frames = 300,
    warmupFrames = 60,
    cycles = 3,
    brushHeight = 0.25,
  } = {}) {
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
    const handle = prepareBrush([
      [
        [asX(xMin), yHigh],
        [asX(xMin + brushWidth), yLow],
      ],
    ]);
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
        handle.move(0, [
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
    prepareBrush,
  };
}
