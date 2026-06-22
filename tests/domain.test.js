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

test("passes non-numeric (e.g. Date) domains through untouched", () => {
  const d = [new Date(2020, 0, 1), new Date(2020, 1, 1)];
  expect(normalizeDomain(d)).toBe(d);
});

test("passes through malformed input", () => {
  expect(normalizeDomain(null)).toBe(null);
  expect(normalizeDomain([1])).toEqual([1]);
});
