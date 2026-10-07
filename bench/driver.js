// In-page benchmark driver. Every adapter is measured the same way: the frame
// starts just before a brush update is applied and ends at the next
// requestAnimationFrame. That is the definition src/PerformanceMonitor.js uses,
// except that here the clock also covers d3's brush.move DOM work, which
// TimeWidget's internal timer starts after.
import { generateData, dataExtent, groupDomains, trajectory, preflightDomains } from "./workload.js";
import { summarize } from "./stats.mjs";

const SIZE = { width: 800, height: 600 };
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function mount(name) {
  const stage = document.getElementById("stage");
  stage.replaceChildren();
  const create = (await import(`./adapters/${name}.js`)).default;
  return create(stage, SIZE);
}

export async function runCell({
  adapter: name,
  lines,
  points,
  groups,
  frames = 300,
  warmupFrames = 60,
  budgetMs = 60000,
  seed = 12345,
}) {
  const data = generateData(lines, points, seed);
  const extent = dataExtent(data);
  const adapter = await mount(name);

  // Load time: data handed over -> first frame presented with the brushes on.
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

// Selected-series counts per adapter at fixed brush positions, for checking
// that every implementation answers the same query.
export async function preflight({ adapters, lines, points, groups, seed = 12345 }) {
  const data = generateData(lines, points, seed);
  const extent = dataExtent(data);
  const out = {};
  for (const name of adapters) {
    const adapter = await mount(name);
    await adapter.load(data, extent);
    await adapter.setGroups(groupDomains(extent, groups));
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
