import { summarizePerformanceMetrics } from "../src/PerformanceMonitor.js";

test("reports sustained FPS and slow-tail FPS from frame durations", () => {
  const report = summarizePerformanceMetrics({
    frame: [100, 100, 200],
    collision: [],
    render: [],
    totalCpu: [],
  });

  expect(report.fps.samples).toBe(3);
  expect(report.fps.mean).toBeCloseTo(7.5);
  expect(report.fps.p50).toBeCloseTo(10);
  expect(report.fps.p5).toBeCloseTo(1000 / 190);
  expect(report.fps.p1).toBeCloseTo(1000 / 198);
  expect(report.frameMs.p95).toBeCloseTo(190);
  expect(report.frameMs.p99).toBeCloseTo(198);
});
