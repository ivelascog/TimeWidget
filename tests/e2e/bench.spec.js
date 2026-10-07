import { test, expect } from "@playwright/test";

// The benchmark harness (bench/) drives TimeWidget and three baselines through
// one common driver. These tests pin behaviour, never timing: numbers from a
// headless CI browser are meaningless (software raster), but a broken adapter
// or a baseline that selects less than TimeWidget would silently corrupt the
// paper's comparison.

test.describe("benchmark API", () => {
  test("prepareBrush creates one group per domain and move() changes the selection", async ({ page }) => {
    await page.goto("/tests/e2e/fixture.html");
    const result = await page.evaluate(() => {
      const el = window.makeWidget(window.makeData({ series: 200, points: 40 }));
      const ext = el.ts.getExtent();
      const [x0, x1] = [+ext.x[0], +ext.x[1]];
      const [y0, y1] = [+ext.y[0], +ext.y[1]];
      const d = (fx0, fx1, fyHigh, fyLow) => [
        [x0 + (x1 - x0) * fx0, y0 + (y1 - y0) * fyHigh],
        [x0 + (x1 - x0) * fx1, y0 + (y1 - y0) * fyLow],
      ];
      const handle = el.ts.performance.prepareBrush([d(0, 0.2, 1, 0), d(0.5, 0.6, 0.6, 0.4)]);
      const counts = () => handle.groupNames.map((n) => el.value.legacyValue.get(n).size);
      const before = counts();
      handle.move(0, d(0.8, 0.85, 0.1, 0.0));
      return { names: handle.groupNames, before, after: counts() };
    });
    expect(result.names).toEqual(["Performance benchmark 1", "Performance benchmark 2"]);
    expect(result.before[0]).toBe(200); // full-height brush selects everything
    expect(result.after[0]).toBeLessThan(200);
  });
});
