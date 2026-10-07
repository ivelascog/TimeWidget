// Pure run planning: which cells exist, in what order they run, which are
// skipped, and what is left when resuming an interrupted session.
import { mulberry32 } from "./workload.js";

export const cellKey = (c) => `${c.adapter}|${c.lines}|${c.points}|${c.groups}`;
export const seriesKey = (c) => `${c.adapter}|${c.points}|${c.groups}`;

// Main sweep: every adapter x series count x brush-group count at mainPoints.
// Points sweep: every adapter at sweepLines with each extra points value, 1 group.
export function buildCells({ adapters, lines, mainPoints, sweepLines, sweepPoints, groups }) {
  const cells = [];
  for (const adapter of adapters) {
    for (const g of groups) {
      for (const n of lines) cells.push({ adapter, lines: n, points: mainPoints, groups: g });
    }
    for (const p of sweepPoints) cells.push({ adapter, lines: sweepLines, points: p, groups: 1 });
  }
  return cells;
}

function shuffle(array, rnd) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Round-robin by repetition, shuffled inside each round, so slow drift
// (thermals, background load) spreads across conditions instead of
// confounding one of them.
export function orderRuns(cells, reps, seed) {
  const rnd = mulberry32(seed);
  const runs = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const cell of shuffle(cells, rnd)) runs.push({ cell, rep });
  }
  return runs;
}

// Skip a size once any run of the same series at a size <= it blew the limit
// or hit the time budget: larger sizes only get slower.
export function shouldSkip(cell, completed, limitMs = 250) {
  const key = seriesKey(cell);
  return completed.some(
    (r) =>
      seriesKey(r.cell) === key &&
      r.cell.lines <= cell.lines &&
      (r.truncated || r.frameMs.p95 > limitMs)
  );
}

export function pendingRuns(ordered, completed) {
  const done = new Set(completed.map((r) => `${cellKey(r.cell)}#${r.rep}`));
  return ordered.filter((r) => !done.has(`${cellKey(r.cell)}#${r.rep}`));
}
