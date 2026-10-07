// TimeWidget as shipped in dist/, driven through ts.performance.prepareBrush.
//
// Adapter contract (all of bench/adapters/*.js):
//   create(container, {width, height}) -> {
//     load(data, extent), setGroups(domains), move(groupIndex, domain),
//     selectedCounts() -> number[], breakdown() -> object|null,
//     resetBreakdown()?, destroy()
//   }
// Domains are [[xLow, yHigh], [xHigh, yLow]]. load/setGroups/move may return
// a promise; the driver awaits it before waiting for the next frame.
export default function create(container, { width, height }) {
  let el = null;
  let handle = null;
  return {
    load(data) {
      el = window.TimeWidget(data, {
        target: container,
        x: "xCoord",
        y: "yCoord",
        id: "id",
        width,
        height,
        autoUpdate: true,
        showGroupMedian: false,
        // A sample buffer bigger than any run, so no measured frame is dropped.
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
