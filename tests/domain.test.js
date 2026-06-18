import { normalizeDomain } from "../src/utils.js";

test("passes through an already-valid numeric domain", () => {
  expect(normalizeDomain([10, 40])).toEqual([10, 40]);
});

test("swaps reversed endpoints", () => {
  expect(normalizeDomain([40, 10])).toEqual([10, 40]);
});

test("widens equal endpoints by eps", () => {
  const [lo, hi] = normalizeDomain([20, 20], { eps: 1e-6 });
  expect(lo).toBe(20);
  expect(hi).toBeCloseTo(20 + 1e-6, 9);
});

test("passes non-numeric (e.g. Date) domains through untouched", () => {
  const d = [new Date(2020, 0, 1), new Date(2020, 1, 1)];
  expect(normalizeDomain(d)).toBe(d);
});

test("passes through malformed input", () => {
  expect(normalizeDomain(null)).toBe(null);
  expect(normalizeDomain([1])).toEqual([1]);
});
