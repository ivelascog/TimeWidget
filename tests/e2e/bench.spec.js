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

test.describe("bench harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/bench/page.html");
    await page.waitForFunction(() => typeof window.benchCell === "function");
  });

  test("timewidget cell returns finite frame stats and a breakdown", async ({ page }) => {
    const r = await page.evaluate(() =>
      window.benchCell({ adapter: "timewidget", lines: 300, points: 20, groups: 3, frames: 10, warmupFrames: 2 })
    );
    expect(r.measuredFrames).toBe(10);
    expect(Number.isFinite(r.frameMs.p50)).toBe(true);
    expect(r.totalCpuMs.samples).toBeGreaterThan(0);
    expect(r.loadMs).toBeGreaterThan(0);
  });

  // Baselines must answer the same query as TimeWidget, or a cheaper baseline
  // could just be one that selects less.
  test("naive baselines select exactly what TimeWidget selects", async ({ page }) => {
    for (const groups of [1, 3]) {
      const r = await page.evaluate(
        (g) => window.benchPreflight({ adapters: ["timewidget", "canvas", "svg"], lines: 1000, points: 20, groups: g }),
        groups
      );
      expect(r.canvas).toEqual(r.timewidget);
      expect(r.svg).toEqual(r.timewidget);
      expect(r.timewidget.flat().some((c) => c > 0)).toBe(true);
    }
  });

  // Vega-Lite tests points, not segments, so agreement is high but not exact.
  // A count of 0 everywhere would mean the brush never reached Vega.
  test("vegalite applies brushes programmatically and mostly agrees with TimeWidget", async ({ page }) => {
    for (const groups of [1, 3]) {
      const r = await page.evaluate(
        (g) => window.benchPreflight({ adapters: ["timewidget", "vegalite"], lines: 1000, points: 20, groups: g }),
        groups
      );
      const tw = r.timewidget.flat();
      const vl = r.vegalite.flat();
      expect(vl.some((c) => c > 0)).toBe(true);
      const diff = tw.reduce((s, c, i) => s + Math.abs(c - vl[i]), 0);
      const agreement = 1 - diff / Math.max(1, tw.reduce((a, b) => a + b, 0));
      expect(agreement).toBeGreaterThan(0.9);
    }
  });

  test("budget truncates a run", async ({ page }) => {
    const r = await page.evaluate(() =>
      window.benchCell({
        adapter: "timewidget", lines: 300, points: 20, groups: 1, frames: 300, warmupFrames: 0, budgetMs: 1,
      })
    );
    expect(r.truncated).toBe(true);
    expect(r.measuredFrames).toBeLessThan(300);
  });
});
