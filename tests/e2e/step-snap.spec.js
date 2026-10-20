import { test, expect } from "@playwright/test";
import { domains, key, selectFirst, selections } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/e2e/fixture.html");
});

for (const snapX of [null, 15]) {
  for (const [arrow, direction] of [["ArrowLeft", -1], ["ArrowRight", 1]]) {
    test(`${arrow} preserves a numeric brush with default stepX and snapX=${snapX}`, async ({ page }) => {
      await page.evaluate((snapX) => {
        window.widget = window.makeWidget(window.makeData({ points: 101 }), {
          xDomain: [0, 100], yDomain: [0, 100], snapX,
          filters: [{ name: "Example", isEnable: true, isActive: true,
            brushes: [{ selectionDomain: [[15, 90], [45, 30]] }] }],
        });
        window.widget.dataset.testid = "widget";
      }, snapX);
      await selectFirst(page);
      await key(page, arrow);
      await expect(selections(page).first()).toBeVisible();
      const [selection] = await domains(page);
      expect(selection[0][0]).toBeCloseTo(15 + direction * (snapX || 1), 5);
      expect(selection[1][0]).toBeCloseTo(45 + direction * (snapX || 1), 5);
    });
  }
}

test("numeric steps are raised to snap intervals only when smaller", async ({ page }) => {
  const steps = await page.evaluate(() => {
    return [[1, 2], [5, 10], [8, 15]].map(([stepX, stepY]) => {
      const widget = window.makeWidget(window.makeData(), {
        stepX, stepY, snapX: 5, snapY: 10,
      });
      return [widget.ts.stepX, widget.ts.stepY];
    });
  });
  expect(steps).toEqual([[5, 10], [5, 10], [8, 15]]);
});

test("time steps compare calendar durations and milliseconds", async ({ page }) => {
  const steps = await page.evaluate(() => {
    return [
      { stepX: { days: 10 }, snapX: { months: 1 } },
      { stepX: { months: 2 }, snapX: { months: 1 } },
      { stepX: { days: 1 }, snapX: 7 * 86400000 },
      { stepX: 86400000, snapX: { days: 7 } },
    ].map((options) => {
      const widget = window.makeWidget(window.makeData({ dates: true }), options);
      return widget.ts.stepX;
    });
  });
  expect(steps).toEqual([{ months: 1 }, { months: 2 }, 7 * 86400000, { days: 7 }]);
});
