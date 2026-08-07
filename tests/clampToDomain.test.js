// Native ESM suite (node --experimental-vm-modules), so jest is not a global.
import { jest } from "@jest/globals";
import * as d3 from "d3";
import { clampToDomain, isInsideDomain } from "../src/utils.js";

// A brush selectionDomain is [[xLow, yHigh], [xHigh, yLow]].
//
// It is produced by getSelectionDomain(), which inverts pixel corners
// [[left, top], [right, bottom]] through the scales. scaleY's range is
// [height, 0], so the TOP pixel inverts to the HIGH data value — which is why
// the first pair carries the high y and the second the low one. Getting this
// backwards renders the brush upside down, so it is pinned down here.
const scaleX = d3.scaleLinear().domain([0, 100]).range([0, 500]);
const scaleY = d3.scaleLinear().domain([0, 50]).range([300, 0]);

const toDomain = (pixels) =>
  pixels.map(([x, y]) => [scaleX.invert(x), scaleY.invert(y)]);
const toPixels = (domain) => domain.map(([x, y]) => [scaleX(x), scaleY(y)]);

describe("selectionDomain convention", () => {
  test("the first pair holds the HIGH y value", () => {
    const domain = toDomain([
      [100, 60],
      [200, 240],
    ]);
    expect(domain[0][1]).toBeGreaterThan(domain[1][1]);
  });
});

describe("clampToDomain", () => {
  test("leaves a selection already inside the domain untouched", () => {
    const domain = toDomain([
      [100, 60],
      [200, 240],
    ]);
    expect(isInsideDomain(domain, scaleX, scaleY)).toBe(true);
    expect(clampToDomain(domain, scaleX.domain(), scaleY.domain())).toEqual(
      domain
    );
  });

  // Regression: clampToDomain normalised y to ascending order and reassembled
  // it ascending, so the brush came back vertically mirrored — a box that
  // rendered with negative height.
  test("preserves y orientation instead of mirroring the brush", () => {
    const domain = toDomain([
      [100, 60],
      [200, 240],
    ]);
    const clamped = clampToDomain(domain, scaleX.domain(), scaleY.domain());

    expect(clamped[0][1]).toBeGreaterThan(clamped[1][1]);

    const [[, top], [, bottom]] = toPixels(clamped);
    expect(bottom - top).toBeCloseTo(180, 6); // positive height, not -180
  });

  test("clamps a selection that overflows the domain on both axes", () => {
    const clamped = clampToDomain(
      [
        [-50, 999],
        [180, -999],
      ],
      scaleX.domain(),
      scaleY.domain()
    );
    expect(clamped).toEqual([
      [0, 50],
      [100, 0],
    ]);
  });

  test("clamps only the axis that overflows", () => {
    const clamped = clampToDomain(
      [
        [20, 999],
        [40, 10],
      ],
      scaleX.domain(),
      scaleY.domain()
    );
    expect(clamped).toEqual([
      [20, 50],
      [40, 10],
    ]);
  });

  test("a clamped selection is inside the domain afterwards", () => {
    const clamped = clampToDomain(
      [
        [-50, 999],
        [180, -999],
      ],
      scaleX.domain(),
      scaleY.domain()
    );
    expect(isInsideDomain(clamped, scaleX, scaleY)).toBe(true);
  });

  test("returns the selection unchanged when it cannot be normalized", () => {
    const domain = [
      ["a", "b"],
      ["c", "d"],
    ];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(clampToDomain(domain, scaleX.domain(), scaleY.domain())).toBe(domain);
    warn.mockRestore();
  });
});
