import {normalizeDomain} from "../src/utils.js";

test("passes through an already-valid numeric domain", () => {
  expect(normalizeDomain([10, 40], [0, 50])).toEqual([10, 40]);
});

test("swaps reversed endpoints", () => {
  expect(normalizeDomain([40, 10], [0, 50])).toEqual([10, 40]);
});

test("Values outside the extend", () => {
  let eps = 1e-6;
  expect(normalizeDomain([10, 40], [20, 30],)).toEqual([20, 30]);
  let [lo, hi] = normalizeDomain([40, 50], [30, 40], {eps: eps});
  expect(hi).toBe(40);
  expect(lo).toBeCloseTo(40 - eps, 9);
  [lo, hi] = normalizeDomain([10, 20], [20, 30], {eps: eps});
  expect(hi).toBeCloseTo(20 + eps, 9);
  expect(lo).toBe(20);

});
test("widens equal endpoints by eps", () => {
  let eps = 1e-6;
  const [lo, hi] = normalizeDomain([20, 20], [0, 50], {eps: eps});
  expect(lo).toBe(20);
  expect(hi).toBeCloseTo(20 + eps, 9);
});

test("passes through malformed input", () => {
  expect(normalizeDomain(null)).toBe(null);
  expect(normalizeDomain([1])).toEqual(null);
});

test("swaps reversed endpoints date", () => {
  let domain = normalizeDomain([new Date("2026-3-1"), new Date("2026-2-1")],
      [new Date("2026-1-1"), new Date("2026-4-1")]);
  expect(domain).toEqual([new Date("2026-2-1"), new Date("2026-3-1")]);
});

test("widens equal endpoints by eps DATE", () => {
  let eps = 1e-6;
  const [lo, hi] = normalizeDomain([new Date("2026-3-1"), new Date("2026-3-1")],
      [new Date("2026-1-1"), new Date("2026-4-1")], {eps: eps});
  expect(lo).toEqual(new Date("2026-3-1"));
  let diff = Math.abs(hi - new Date(new Date("2026-3-1").getTime() + eps));
  expect(diff).toBeLessThanOrEqual(100);
});