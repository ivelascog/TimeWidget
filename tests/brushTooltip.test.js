import { clampTooltipPosition } from "../src/BrushTooltipEditable.js";

const bounds = [
  [0, 0],
  [200, 100],
];

test("keeps a start-anchored tooltip inside the bottom-right edges", () => {
  expect(clampTooltipPosition([190, 95], [40, 20], bounds)).toEqual([160, 80]);
});

test("keeps an end-anchored tooltip inside the top-left edges", () => {
  expect(
    clampTooltipPosition([10, 5], [40, 20], bounds, {
      alignX: "end",
      alignY: "end",
    })
  ).toEqual([0, 0]);
});

test("preserves the preferred position when it fits", () => {
  expect(clampTooltipPosition([50, 30], [40, 20], bounds)).toEqual([50, 30]);
  expect(
    clampTooltipPosition([50, 30], [40, 20], bounds, {
      alignX: "end",
      alignY: "end",
    })
  ).toEqual([10, 10]);
});
