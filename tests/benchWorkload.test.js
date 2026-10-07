import {
  mulberry32,
  generateData,
  dataExtent,
  groupDomains,
  trajectory,
  preflightDomains,
  polylineIntersectsBox,
  groupById,
} from "../bench/workload.js";

test("generateData is deterministic and sized lines*points", () => {
  const a = generateData(10, 20);
  const b = generateData(10, 20);
  expect(a).toHaveLength(200);
  expect(a).toEqual(b);
  expect(a[0]).toEqual({ id: 0, xCoord: 0, yCoord: expect.any(Number) });
  expect(a[19].xCoord).toBe(100);
});

test("mulberry32 differs per seed", () => {
  expect(mulberry32(1)()).not.toBe(mulberry32(2)());
});

test("dataExtent spans the data", () => {
  const e = dataExtent(generateData(5, 10));
  expect(e.x).toEqual([0, 100]);
  expect(e.y[0]).toBeLessThan(e.y[1]);
});

test("trajectory sweeps inside the extent and keeps [[xLow,yHigh],[xHigh,yLow]]", () => {
  const ext = { x: [0, 100], y: [0, 50] };
  const step = trajectory(ext, 360);
  for (let i = 0; i < 360; i++) {
    const [[x0, yHigh], [x1, yLow]] = step(i);
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(100 + 1e-9);
    expect(x1 - x0).toBeCloseTo(20);
    expect(yHigh).toBeGreaterThan(yLow);
  }
  expect(step(0)[0][0]).not.toBe(step(60)[0][0]);
});

test("groupDomains returns one domain per group, distinct bands", () => {
  const ext = { x: [0, 100], y: [0, 100] };
  const ds = groupDomains(ext, 3);
  expect(ds).toHaveLength(3);
  expect(new Set(ds.map((d) => d[0][1])).size).toBe(3);
  expect(groupDomains(ext, 1)).toHaveLength(1);
});

test("preflightDomains gives 5 domains", () => {
  expect(preflightDomains({ x: [0, 1], y: [0, 1] })).toHaveLength(5);
});

describe("polylineIntersectsBox", () => {
  const box = [
    [2, 4],
    [4, 2],
  ]; // x 2..4, y 2..4
  test("segment crossing the box", () => {
    expect(polylineIntersectsBox([0, 6], [3, 3], box)).toBe(true);
  });
  test("segment fully inside", () => {
    expect(polylineIntersectsBox([2.5, 3.5], [3, 3], box)).toBe(true);
  });
  test("segment passing above", () => {
    expect(polylineIntersectsBox([0, 6], [5, 5], box)).toBe(false);
  });
  test("diagonal clipping a corner", () => {
    expect(polylineIntersectsBox([0, 6], [6, 0], box)).toBe(true);
  });
  test("diagonal missing the corner", () => {
    expect(polylineIntersectsBox([0, 1], [1, 0], box)).toBe(false);
  });
});

test("groupById splits series-major rows", () => {
  const g = groupById(generateData(3, 4));
  expect(g.ids).toEqual([0, 1, 2]);
  expect(g.xs[1]).toHaveLength(4);
});
