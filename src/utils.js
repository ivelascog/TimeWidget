import * as d3 from "d3";

let DEBUG = false;
let PERFORMANCE = true;
let before = 0;
let beforePerformance = 0;
let performanceDeltas = [];


export function log() {
  if (DEBUG) console.log(performance.now() - before, ...arguments);
  before = performance.now();
}

export function logPerformance(print) {
    if (PERFORMANCE) {
        if (print) {
            let delta = performance.now() - beforePerformance;
            if (delta > 400) return; //Init Time
            console.log(delta, "FrameTime");
            performanceDeltas.push(delta);
            if (performanceDeltas.length % 100 === 0) {
                console.log(`Median Performance in ${performanceDeltas.length} samples is ${d3.mean(performanceDeltas)}`);
            }
        }
        beforePerformance = performance.now();
    }
}

export function darken(color, k = 1) {
  const { l, c, h } = d3.lch(color);
  return d3.lch(l - 18 * k, c, h);
}

export function compareSets(set1, set2) {
  if (set1 === set2) return true;
  if (set1 === null) return false;
  if (set2 === null) return false;

  if (set1.size !== set2.size) return false;

  for (const val of set1) {
    if (!set2.has(val)) {
      return false;
    }
  }
  return true;
}

export function isInsideDomain(domain, scaleX, scaleY) {
  let scaleXDomain = scaleX.domain();
  let scaleYDomain = scaleY.domain();
  let domainX = [domain[0][0], domain[1][0]];
  let domainY = [domain[1][1], domain[0][1]];

  return (
      domainX[0] >= scaleXDomain[0] &&
      domainX[1] <= scaleXDomain[1] &&
      domainY[0] >= scaleYDomain[0] &&
      domainY[1] <= scaleYDomain[1]
  );
}

export const BrushModes = Object.freeze({
  Intersect: "intersect",
  Contains: "contains",
});

export const BrushAggregation = Object.freeze({
  And: "and",
    Or: "or",
});

// Normalize a numeric [lo, hi] domain: order endpoints, widen a zero-width
// interval by eps. Non-numeric domains (e.g. Dates) and malformed input pass
// through unchanged so the scaleTime path is never broken.
export function normalizeDomain(domain, extent, {eps = 1e-6} = {}) {
    if (!Array.isArray(domain) || domain.length !== 2) return domain;
    let [lo, hi] = domain;
    if (typeof lo !== "number" || typeof hi !== "number") return domain;
    if (Number.isNaN(lo) || Number.isNaN(hi)) return domain;
    if (lo > hi) [lo, hi] = [hi, lo];
    if (lo === hi) hi = lo + eps;
    if (lo <= extent[0]) lo = extent[0];
    if (hi <= extent[0]) hi = extent[0] + eps;
    if (hi >= extent[1]) hi = extent[1];
    if (lo >= extent[1]) lo = extent[1] - eps;
    return [lo, hi];
}
