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

// Clamp a brush selectionDomain into the current axis domains.
//
// A selectionDomain is [[xLow, yHigh], [xHigh, yLow]]: it is built from the
// pixel corners [[left, top], [right, bottom]], and scaleY inverts (its range
// is [height, 0]), so the FIRST pair carries the HIGH y value. normalizeDomain
// works in ascending order, so y is reversed on the way in and must be
// reversed again on the way out — returning it ascending flips the brush
// upside down. isInsideDomain() encodes the same convention.
export function clampToDomain(domain, xDomain, yDomain) {
  let clampedX = normalizeDomain([domain[0][0], domain[1][0]], xDomain, {
    eps: 0,
  });
  let clampedY = normalizeDomain([domain[1][1], domain[0][1]], yDomain, {
    eps: 0,
  });
  // Nothing sensible to clamp to — leave the selection as it was.
  if (!clampedX || !clampedY) return domain;
  return [
    [clampedX[0], clampedY[1]],
    [clampedX[1], clampedY[0]],
  ];
}

export const BrushModes = Object.freeze({
  Intersect: "intersect",
  Contains: "contains",
});

export const BrushAggregation = Object.freeze({
  And: "and",
    Or: "or",
});

// Normalize a [lo, hi] domain against the axis's full data extent: order the
// endpoints, widen a zero-width interval by eps, and clamp the result inside
// extent. Numbers and Dates are both supported; a Date domain returns Dates.
// Returns null for anything malformed, so callers can `|| fallback`.
//
// `extent` is a single axis pair, e.g. ts.fullExtent.x — NOT the whole
// {x, y} object. Passing the object silently disabled clamping before, so a
// bad extent now warns rather than quietly doing nothing.
export function normalizeDomain(domain, extent, { eps = 1e-6 } = {}) {
  if (!Array.isArray(domain) || domain.length !== 2) return null;

  let [lo, hi] = domain;
  if (lo > hi) [lo, hi] = [hi, lo];

  let isDate = false;
  if (lo instanceof Date && hi instanceof Date) {
    lo = lo.getTime();
    hi = hi.getTime();
    isDate = true;
  }

  if (typeof lo !== "number" || typeof hi !== "number") {
    console.warn("normalizeDomain: unsupported domain type", domain);
    return null;
  }
  if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
  if (lo === hi) hi = lo + eps;

  let bounds = Array.isArray(extent) && extent.length === 2 ? extent : null;
  if (extent !== undefined && !bounds) {
    console.warn(
      "normalizeDomain: expected an [lo, hi] extent pair, got",
      extent,
      "— skipping clamp"
    );
  }
  if (bounds) {
    let [min, max] = bounds.map((d) => (d instanceof Date ? d.getTime() : d));
    if (lo <= min) lo = min;
    if (hi <= min) hi = min + eps;
    if (hi >= max) hi = max;
    if (lo >= max) lo = max - eps;
  }

  return isDate ? [new Date(lo), new Date(hi)] : [lo, hi];
}

// Resolve a {x, y} pair of requested domains against the widget's full extent.
// Takes the whole {x, y} extent object and does the per-axis lookup itself, so
// a caller cannot hand normalizeDomain the wrong shape — the mistake that
// silently disabled clamping in ts.setDomains(). An axis that is not requested,
// or whose request is malformed, keeps its current domain.
// NOTE: no `??` / `?.` here — the build's rollup-plugin-ascii bundles an old
// acorn that cannot parse them, and rollup fails before Babel ever runs.
export function resolveDomains(requested = {}, fullExtent = {}, current = {}) {
  let resolved = {};
  for (let axis of ["x", "y"]) {
    let ask = requested[axis];
    let next =
      ask === undefined || ask === null
        ? null
        : normalizeDomain(ask, fullExtent[axis]);
    resolved[axis] = next === null ? current[axis] : next;
  }
  return resolved;
}
