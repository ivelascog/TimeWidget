// The suite runs as native ESM (node --experimental-vm-modules), so the jest
// object is not a global — it has to be imported.
import { jest } from "@jest/globals";
import { normalizeDomain, resolveDomains } from "../src/utils.js";

const EPS = 1e-6;

// normalizeDomain warns on purpose for bad input; keep the test output clean.
let warnSpy;
beforeEach(() => {
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe("normalizeDomain", () => {
  test("passes through an already-valid numeric domain", () => {
    expect(normalizeDomain([10, 40], [0, 50])).toEqual([10, 40]);
  });

  test("swaps reversed endpoints", () => {
    expect(normalizeDomain([40, 10], [0, 50])).toEqual([10, 40]);
  });

  test("clamps values outside the extent", () => {
    expect(normalizeDomain([10, 40], [20, 30])).toEqual([20, 30]);

    let [lo, hi] = normalizeDomain([40, 50], [30, 40], { eps: EPS });
    expect(hi).toBe(40);
    expect(lo).toBeCloseTo(40 - EPS, 9);

    [lo, hi] = normalizeDomain([10, 20], [20, 30], { eps: EPS });
    expect(lo).toBe(20);
    expect(hi).toBeCloseTo(20 + EPS, 9);
  });

  test("widens equal endpoints by eps", () => {
    const [lo, hi] = normalizeDomain([20, 20], [0, 50], { eps: EPS });
    expect(lo).toBe(20);
    expect(hi).toBeCloseTo(20 + EPS, 9);
  });

  test("passes through malformed input", () => {
    expect(normalizeDomain(null)).toBe(null);
    expect(normalizeDomain([1])).toEqual(null);
    expect(normalizeDomain(["a", "b"], [0, 50])).toBe(null);
    expect(normalizeDomain([NaN, 10], [0, 50])).toBe(null);
  });

  test("swaps reversed endpoints for dates", () => {
    const domain = normalizeDomain(
      [new Date("2026-3-1"), new Date("2026-2-1")],
      [new Date("2026-1-1"), new Date("2026-4-1")]
    );
    expect(domain).toEqual([new Date("2026-2-1"), new Date("2026-3-1")]);
  });

  test("widens equal endpoints by eps for dates", () => {
    const [lo, hi] = normalizeDomain(
      [new Date("2026-3-1"), new Date("2026-3-1")],
      [new Date("2026-1-1"), new Date("2026-4-1")],
      { eps: EPS }
    );
    expect(lo).toEqual(new Date("2026-3-1"));
    const diff = Math.abs(hi - new Date(new Date("2026-3-1").getTime() + EPS));
    expect(diff).toBeLessThanOrEqual(100);
  });

  test("clamps dates to the extent", () => {
    expect(
      normalizeDomain(
        [new Date("2025-1-1"), new Date("2027-1-1")],
        [new Date("2026-1-1"), new Date("2026-12-1")]
      )
    ).toEqual([new Date("2026-1-1"), new Date("2026-12-1")]);
  });

  // Regression: ts.data() called normalizeDomain(domain, ts.extent), and
  // ts.extent is never assigned — a valid numeric domain threw
  // "Cannot read properties of undefined (reading '0')".
  test("a missing extent skips the clamp instead of throwing", () => {
    expect(() => normalizeDomain([10, 40], undefined)).not.toThrow();
    expect(normalizeDomain([10, 40], undefined)).toEqual([10, 40]);
  });

  // Regression: ts.setDomains() passed the whole {x, y} object as the extent.
  // Every comparison against extent[0] === undefined was false, so clamping
  // silently did nothing. It must not look like a successful clamp.
  test("warns and skips the clamp when handed a non-pair extent", () => {
    const result = normalizeDomain([-999, 9999], { x: [0, 100], y: [5, 50] });
    expect(warnSpy).toHaveBeenCalled();
    expect(result).toEqual([-999, 9999]);
  });
});

describe("resolveDomains", () => {
  const fullExtent = { x: [0, 100], y: [5, 50] };
  const current = { x: [10, 90], y: [10, 40] };

  // This is the call ts.setDomains() makes. Passing the {x, y} extent object
  // is now correct by construction rather than a shape the caller can get wrong.
  test("clamps each requested axis against its own extent", () => {
    expect(resolveDomains({ x: [-999, 9999] }, fullExtent, current).x).toEqual([
      0, 100,
    ]);
    expect(resolveDomains({ y: [-999, 9999] }, fullExtent, current).y).toEqual([
      5, 50,
    ]);
  });

  test("leaves an unrequested axis on its current domain", () => {
    const next = resolveDomains({ x: [20, 30] }, fullExtent, current);
    expect(next.x).toEqual([20, 30]);
    expect(next.y).toEqual(current.y);
  });

  test("keeps the current domain when a request is malformed", () => {
    expect(resolveDomains({ x: [1] }, fullExtent, current).x).toEqual(current.x);
    expect(resolveDomains({ x: "nope" }, fullExtent, current).x).toEqual(
      current.x
    );
  });

  test("an empty request changes nothing", () => {
    expect(resolveDomains({}, fullExtent, current)).toEqual(current);
  });

  test("resolves both axes at once", () => {
    expect(resolveDomains({ x: [20, 30], y: [8, 12] }, fullExtent, current))
      .toEqual({ x: [20, 30], y: [8, 12] });
  });
});
