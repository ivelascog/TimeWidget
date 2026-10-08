import { buildCells, cellKey, orderRuns, shouldSkip, pendingRuns } from "../bench/plan.mjs";

const cfg = {
  adapters: ["timewidget", "svg"],
  lines: [1000, 10000],
  mainPoints: 20,
  sweepLines: 5000,
  sweepPoints: [100, 500],
  groups: [1, 3],
};

test("buildCells: main sweep x groups plus points sweep at 1 group", () => {
  const cells = buildCells(cfg);
  // 2 adapters * (2 lines * 2 groups + 2 sweep points) = 12
  expect(cells).toHaveLength(12);
  expect(cells).toContainEqual({ adapter: "svg", lines: 5000, points: 500, groups: 1 });
  expect(new Set(cells.map(cellKey)).size).toBe(12);
});

test("orderRuns: every cell once per rep, rounds in order, deterministic", () => {
  const cells = buildCells(cfg);
  const a = orderRuns(cells, 3, 7);
  expect(a).toHaveLength(36);
  expect(a.slice(0, 12).every((r) => r.rep === 0)).toBe(true);
  expect(orderRuns(cells, 3, 7)).toEqual(a);
  expect(orderRuns(cells, 3, 8)).not.toEqual(a);
});

describe("shouldSkip", () => {
  const big = { adapter: "svg", lines: 10000, points: 20, groups: 1 };
  const small = { ...big, lines: 1000 };
  const done = (frameP95, truncated = false) => [{ cell: small, rep: 0, frameMs: { p95: frameP95 }, truncated }];

  test("skips a size once a smaller size of the same series blew the limit", () => {
    expect(shouldSkip(big, done(300))).toBe(true);
  });
  test("other series are unaffected", () => {
    expect(shouldSkip({ ...big, adapter: "timewidget" }, done(300))).toBe(false);
    expect(shouldSkip({ ...big, groups: 3 }, done(300))).toBe(false);
  });
  test("does not skip while under the limit", () => {
    expect(shouldSkip(big, done(20))).toBe(false);
  });
  test("judges by per-frame stage cost when it was recorded", () => {
    const r = [{ cell: small, rep: 0, frameMs: { p95: 20 }, frameCostMs: { samples: 300, p95: 400 }, truncated: false }];
    expect(shouldSkip(big, r)).toBe(true);
  });
  test("a truncated run counts as over the limit", () => {
    expect(shouldSkip(big, done(20, true))).toBe(true);
  });
  // Review finding: a crash wrote no record, so --resume retried it forever.
  test("a crashed run counts as over the limit", () => {
    expect(shouldSkip(big, [{ type: "crash", cell: small, rep: 0, error: "OOM" }])).toBe(true);
    expect(shouldSkip(small, [{ type: "crash", cell: small, rep: 0, error: "OOM" }])).toBe(true);
  });
  test("a truncated run counts as over the limit (again)", () => {
    expect(shouldSkip(big, done(20, true))).toBe(true);
  });
  test("smaller sizes are never skipped because of a bigger one", () => {
    expect(shouldSkip(small, [{ cell: big, rep: 0, frameMs: { p95: 999 }, truncated: false }])).toBe(false);
  });
});

test("pendingRuns drops completed (cell, rep) pairs", () => {
  const ordered = orderRuns(buildCells(cfg), 2, 1);
  const completed = [{ cell: ordered[0].cell, rep: ordered[0].rep, frameMs: { p95: 1 } }];
  const pending = pendingRuns(ordered, completed);
  expect(pending).toHaveLength(ordered.length - 1);
  expect(pending[0]).toEqual(ordered[1]);
});
