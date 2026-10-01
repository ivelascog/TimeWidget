import { test, expect } from "@playwright/test";

// End-to-end coverage for the zoom work in #63 (ts.setDomains / ts.fullExtent)
// and #65 (median clamp, reference-curve redraw, brush re-projection).
//
// These run in a real browser on purpose. Every bug fixed in those two PRs was
// a call-site or render bug that the unit suite could not see: it stayed at
// 19/19 green while all of them were live. What each case pins is noted inline
// so a future failure says which regression came back.

const FIXTURE = "/tests/e2e/fixture.html";

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => !!window.TimeWidget && !!window.makeWidget);
});

// Fails the test if anything threw into window.onerror. Several of these bugs
// aborted a re-render without rejecting a promise, so an assertion on the
// return value alone would pass while the chart was visibly broken.
async function expectNoPageErrors(page) {
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
}

test.describe("#63 domain options and setDomains", () => {
  // Regression: ts.data() called normalizeDomain(domain, ts.extent), but
  // ts.extent is never assigned — a numeric domain threw
  // "Cannot read properties of undefined (reading '0')".
  test("a numeric xDomain/yDomain option does not throw", async ({ page }) => {
    const domains = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }), {
        xDomain: [5, 12],
        yDomain: [80, 120],
      });
      return { x: w.ts.xDomain, y: w.ts.yDomain };
    });
    expect(domains.x).toEqual([5, 12]);
    expect(domains.y).toEqual([80, 120]);
    await expectNoPageErrors(page);
  });

  test("a Date xDomain option does not throw", async ({ page }) => {
    const x = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40, dates: true }), {
        x: "t",
        xDomain: [new Date(2023, 0, 5), new Date(2023, 0, 12)],
      });
      return w.ts.xDomain.map((d) => d.toISOString().slice(0, 10));
    });
    expect(x).toEqual(["2023-01-05", "2023-01-12"]);
    await expectNoPageErrors(page);
  });

  test("an out-of-extent constructor domain is clamped, not applied raw", async ({
    page,
  }) => {
    const { yDomain, extent } = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }), {
        yDomain: [-5000, 5000],
      });
      return { yDomain: w.ts.yDomain, extent: w.ts.getExtent().y };
    });
    expect(yDomain).toEqual(extent);
  });

  // Regression: setDomains passed the whole {x, y} fullExtent object where
  // normalizeDomain wanted one [lo, hi] pair, so extent[0] was undefined,
  // every clamp comparison was false, and clamping silently never ran.
  test("setDomains clamps a request that exceeds the data extent", async ({
    page,
  }) => {
    const { yDomain, extent } = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      w.ts.setDomains({ y: [-9999, 9999] });
      return { yDomain: w.ts.yDomain, extent: w.ts.getExtent().y };
    });
    expect(yDomain).toEqual(extent);
  });

  test("setDomains applies an in-range zoom exactly", async ({ page }) => {
    const yDomain = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      w.ts.setDomains({ y: [95, 125] });
      return w.ts.yDomain;
    });
    expect(yDomain).toEqual([95, 125]);
  });

  test("an unrequested axis keeps its current domain", async ({ page }) => {
    const { before, after } = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      const before = w.ts.yDomain.slice();
      w.ts.setDomains({ x: [10, 20] });
      return { before, after: w.ts.yDomain };
    });
    expect(after).toEqual(before);
  });

  // Regression: fullExtent sat behind `if (!ts.fullExtent)`, so it kept the
  // first dataset's range forever. Since domains clamp to fullExtent, records
  // outside that first range could never be brought into view.
  test("fullExtent follows a new dataset", async ({ page }) => {
    const { first, second } = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      const first = w.ts.getExtent().y.slice();
      const wide = window.makeData({ points: 40 });
      wide.push({ t: 41, v: 9999, id: "s0" }, { t: 42, v: -9999, id: "s0" });
      w.ts.data(wide);
      return { first, second: w.ts.getExtent().y };
    });
    expect(second).not.toEqual(first);
    expect(second[1]).toBeGreaterThanOrEqual(9999);
  });
});

test.describe("#65 median binning", () => {
  // Regression: bins are indexed off the X domain, and the old code only
  // handled overshooting by exactly one bin. Zooming leaves data far outside
  // [minX, maxX], so the index landed outside `bins` and threw — aborting the
  // whole re-render, which is why brushes looked like they re-projected on Y
  // but not on X.
  test("zooming X with a brush and medians active does not throw", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ series: 30, points: 40 }), {
        filters: [
          {
            name: "G1",
            isEnable: true,
            isActive: true,
            brushes: [
              {
                mode: "intersect",
                aggregation: "and",
                selectionDomain: [
                  [10, 130],
                  [20, 90],
                ],
              },
            ],
          },
        ],
      });
      w.ts.setDomains({ x: [12, 28] });
      w.ts.setDomains({ x: [0, 39] });
      window.__w = w;
    });
    await expectNoPageErrors(page);
  });
});

test.describe("#65 reference curves", () => {
  const CURVE = [
    [30, 120],
    [0, 100],
    [20, 140],
    [10, 90],
    [39, 150],
  ];

  // Regression: addReferenceCurves sorted the caller's array in place, under a
  // comment promising not to mutate.
  test("the caller's curve array is not mutated", async ({ page }) => {
    const { length, firstX } = await page.evaluate((curve) => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      const data = curve.slice();
      w.ts.addReferenceCurves([{ data, color: "red", opacity: 1 }]);
      return { length: data.length, firstX: data[0][0] };
    }, CURVE);
    expect(length).toBe(5);
    expect(firstX).toBe(30); // still the caller's original order
  });

  test("the stored copy is sorted by x", async ({ page }) => {
    const xs = await page.evaluate((curve) => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      w.ts.addReferenceCurves([{ data: curve.slice(), color: "red", opacity: 1 }]);
      return w.ts._referenceCurves[0].data.map((p) => p[0]);
    }, CURVE);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  // Regression: curves given as the constructor option were stored unsorted
  // while addReferenceCurves() sorted them, so those drew as zig-zags.
  test("curves given as a constructor option are sorted too", async ({ page }) => {
    const xs = await page.evaluate((curve) => {
      const w = window.makeWidget(window.makeData({ points: 40 }), {
        referenceCurves: [{ data: curve.slice(), color: "red", opacity: 1 }],
      });
      return w.ts._referenceCurves[0].data.map((p) => p[0]);
    }, CURVE);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  // Regression: addReferenceCurves destructively reassigned c.data to the
  // subset inside the initial domain, so ts.update() never redrew it and
  // zooming out could not restore the discarded points.
  test("curves re-project on zoom and fully restore on zoom out", async ({
    page,
  }) => {
    const r = await page.evaluate((curve) => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      w.ts.addReferenceCurves([{ data: curve.slice(), color: "red", opacity: 1 }]);
      const d = () => w.querySelector("path.referenceCurve").getAttribute("d");
      const stored = () => w.ts._referenceCurves[0].data.length;

      const full = d();
      const storedFull = stored();
      w.ts.setDomains({ x: [15, 25] });
      const zoomed = d();
      const storedZoomed = stored();
      w.ts.setDomains({ x: [0, 39] });
      return { full, zoomed, back: d(), storedFull, storedZoomed, storedBack: stored() };
    }, CURVE);

    expect(r.zoomed).not.toBe(r.full); // the curve tracked the zoom
    expect(r.back).toBe(r.full); // and came back identical
    expect(r.storedZoomed).toBe(r.storedFull); // nothing was destroyed
    expect(r.storedBack).toBe(r.storedFull);
    await expectNoPageErrors(page);
  });
});

test.describe("#65 clip-path", () => {
  test("gReferences is clipped", async ({ page }) => {
    const { clipId, ref } = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      return {
        clipId: w.querySelector("clipPath").id,
        ref: w.querySelector("g.gReferences").getAttribute("clip-path"),
      };
    });
    expect(clipId).toMatch(/^plotClip-\d+$/);
    expect(ref).toBe(`url(#${clipId})`);
  });

  // Regression: the id was hardcoded. Unlike the other ids here, which are only
  // used as selectors scoped to a widget's own subtree, clip-path="url(#…)" is
  // resolved document-wide — so a second widget was clipped by the first one's
  // rect.
  test("each widget instance gets its own clip id", async ({ page }) => {
    const ids = await page.evaluate(() => {
      window.makeWidget(window.makeData({ points: 20 }), {}, { hidden: true });
      window.makeWidget(window.makeData({ points: 20 }), {}, { hidden: true });
      window.makeWidget(window.makeData({ points: 20 }), {}, { hidden: true });
      return [...document.querySelectorAll("clipPath")].map((c) => c.id);
    });
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the clip id survives a re-render", async ({ page }) => {
    const { before, after, ref } = await page.evaluate(() => {
      const w = window.makeWidget(window.makeData({ points: 40 }));
      const before = w.querySelector("clipPath").id;
      w.ts.setDomains({ x: [10, 30] });
      return {
        before,
        after: w.querySelector("clipPath").id,
        ref: w.querySelector("g.gReferences").getAttribute("clip-path"),
      };
    });
    expect(after).toBe(before);
    expect(ref).toBe(`url(#${before})`); // still resolvable after update
  });
});

test.describe("#65 brush re-projection", () => {
  // Builds a widget carrying one brush, via the same addFilters path the app
  // uses when restoring state.
  const withBrush = (selectionDomain, opts = {}) => ({ selectionDomain, opts });

  async function build(page, selectionDomain, opts = {}) {
    return page.evaluate(
      ({ selectionDomain, opts }) => {
        const w = window.makeWidget(
          window.makeData({ series: 30, points: 40 }),
          Object.assign(
            {
              filters: [
                {
                  name: "G1",
                  isEnable: true,
                  isActive: true,
                  brushes: [
                    { mode: "intersect", aggregation: "and", selectionDomain },
                  ],
                },
              ],
            },
            opts
          )
        );
        window.__w = w;
        // rect.selection also matches d3's hidden pending brush, which carries
        // no width/height — take the rendered one.
        const rect = [...w.querySelectorAll("rect.selection")].find(
          (r) => r.getAttribute("width") !== null
        );
        return {
          width: rect && +rect.getAttribute("width"),
          height: rect && +rect.getAttribute("height"),
        };
      },
      { selectionDomain, opts }
    );
  }

  test("a brush inside the domain renders with positive extent", async ({
    page,
  }) => {
    const r = await build(page, [
      [10, 130],
      [20, 90],
    ]);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    await expectNoPageErrors(page);
  });

  // NOTE on clampToDomain's y ordering.
  //
  // A selectionDomain is [[xLow, yHigh], [xHigh, yLow]] — built from pixel
  // corners, and scaleY inverts, so the first pair holds the HIGH value.
  // clampToDomain originally rebuilt it ascending, contradicting that
  // convention (and isInsideDomain, which encodes it correctly).
  //
  // There is deliberately NO e2e case for that ordering, because it is not
  // observable here: the two orderings name the same pair of corners,
  // d3.brush.move normalises the extent, and newBrush() stores
  // selectionDomain: null and re-derives it from the normalised pixels. The
  // wrong order is laundered before anything can see it. The contract is
  // pinned at the unit level instead — tests/clampToDomain.test.js, which does
  // fail when the ordering is reversed. Asserting it here would be a test that
  // passes either way.
  // There is also no e2e case asserting that an out-of-domain selectionDomain
  // ends up inside the domain. It was written and then deleted: it passed with
  // clampToDomain stubbed out to return its input unchanged. d3's brush
  // `extent` already confines the rendered pixels to the plot area, and the
  // stored domain is re-derived from those pixels, so that assertion holds
  // whether or not any clamping ran. It read as coverage and was worth nothing.
  test("a brush outside the domain still renders after clamping", async ({
    page,
  }) => {
    const r = await build(
      page,
      [
        [10, 500],
        [20, -500],
      ],
      { yDomain: [80, 120] }
    );
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    await expectNoPageErrors(page);
  });

  test("a brush keeps its data coordinates across an x zoom", async ({ page }) => {
    await build(page, [
      [10, 130],
      [20, 90],
    ]);
    const r = await page.evaluate(() => {
      const w = window.__w;
      const rect = () =>
        [...w.querySelectorAll("rect.selection")].find(
          (r) => r.getAttribute("width") !== null
        );
      const before = +rect().getAttribute("width");
      w.ts.setDomains({ x: [5, 25] }); // zoom in; brush still fully contained
      return { before, after: +rect().getAttribute("width") };
    });
    // Same data range over a narrower domain must render wider, not vanish or
    // stay pinned to its old pixels.
    expect(r.after).toBeGreaterThan(r.before);
    await expectNoPageErrors(page);
  });

  test("a user-drawn brush survives a zoom", async ({ page }) => {
    await page.evaluate(() => {
      window.__w = window.makeWidget(window.makeData({ series: 30, points: 40 }));
    });
    const box = await page.locator("#target svg, svg").first().boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65, {
      steps: 12,
    });
    await page.mouse.up();

    const drawn = await page.evaluate(
      () =>
        [...window.__w.querySelectorAll("rect.selection")].filter(
          (r) => r.getAttribute("width") !== null && +r.getAttribute("width") > 0
        ).length
    );
    expect(drawn).toBeGreaterThan(0);

    await page.evaluate(() => window.__w.ts.setDomains({ x: [5, 30] }));
    await expectNoPageErrors(page);
  });
});
