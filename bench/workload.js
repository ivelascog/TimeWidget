// Pure workload definition shared by the browser driver and jest: seeded data,
// brush geometry, and the polyline/box test the naive baselines use.
// Domains use TimeWidget's convention: [[xLow, yHigh], [xHigh, yLow]].

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same model as example/Performance.html: baseline, trend, seasonality and
// autocorrelated noise, x in [0, 100]. Rows are series-major.
export function generateData(lines, points, seed = 12345) {
  const rnd = mulberry32(seed);
  const data = new Array(lines * points);
  let k = 0;
  for (let i = 0; i < lines; i++) {
    const baseline = 15 + rnd() * 70;
    const trend = (rnd() - 0.5) * 25;
    const amplitude = 2 + rnd() * 7;
    const frequency = 0.75 + rnd() * 1.5;
    const phase = rnd() * Math.PI * 2;
    let noise = (rnd() - 0.5) * 3;
    for (let j = 0; j < points; j++) {
      const time = points === 1 ? 0 : j / (points - 1);
      noise = noise * 0.75 + (rnd() - 0.5) * 2.5;
      data[k++] = {
        id: i,
        xCoord: time * 100,
        yCoord:
          baseline +
          trend * time +
          amplitude * Math.sin(Math.PI * 2 * frequency * time + phase) +
          noise,
      };
    }
  }
  return data;
}

export function dataExtent(data) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const d of data) {
    if (d.xCoord < x0) x0 = d.xCoord;
    if (d.xCoord > x1) x1 = d.xCoord;
    if (d.yCoord < y0) y0 = d.yCoord;
    if (d.yCoord > y1) y1 = d.yCoord;
  }
  return { x: [x0, x1], y: [y0, y1] };
}

function box(extent, fx0, fx1, fyCenter, heightRatio) {
  const [x0, x1] = extent.x;
  const [y0, y1] = extent.y;
  const h = (y1 - y0) * heightRatio;
  const yc = y0 + (y1 - y0) * fyCenter;
  return [
    [x0 + (x1 - x0) * fx0, yc + h / 2],
    [x0 + (x1 - x0) * fx1, yc - h / 2],
  ];
}

// Group 0 is the moving brush (centre band, starts at the left edge). Extra
// groups are static brushes in their own vertical bands, as when a user drags
// one TimeBox while others stay put.
export function groupDomains(extent, groups, { widthRatio = 0.2, heightRatio = 0.25 } = {}) {
  const statics = [
    [0.15, 0.2],
    [0.65, 0.8],
  ];
  const result = [box(extent, 0, widthRatio, 0.5, heightRatio)];
  for (let g = 1; g < groups; g++) {
    const [fx, fy] = statics[(g - 1) % statics.length];
    result.push(box(extent, fx, fx + widthRatio, fy, heightRatio));
  }
  return result;
}

// Triangle sweep across the x extent, same shape as ts.performance.runBrush.
export function trajectory(extent, totalFrames, { cycles = 3, widthRatio = 0.2, heightRatio = 0.25 } = {}) {
  const [x0, x1] = extent.x;
  const width = (x1 - x0) * widthRatio;
  const start = box(extent, 0, widthRatio, 0.5, heightRatio);
  const yHigh = start[0][1];
  const yLow = start[1][1];
  return function (i) {
    const progress = totalFrames === 1 ? 0.5 : (i + 1) / totalFrames;
    const phase = (progress * cycles * 2) % 2;
    const tri = phase <= 1 ? phase : 2 - phase;
    const left = x0 + (x1 - x0 - width) * tri;
    return [
      [left, yHigh],
      [left + width, yLow],
    ];
  };
}

// Fixed positions for the cross-adapter equivalence check.
export function preflightDomains(extent) {
  return [0.05, 0.25, 0.45, 0.65, 0.8].map((fx, i) => box(extent, fx, fx + 0.15, 0.3 + i * 0.1, 0.2));
}

// True if any part of the polyline lies inside or on the box (Liang–Barsky
// clip per segment).
export function polylineIntersectsBox(xs, ys, domain) {
  const [[bx0, by1], [bx1, by0]] = domain;
  if (xs.length === 1) {
    return xs[0] >= bx0 && xs[0] <= bx1 && ys[0] >= by0 && ys[0] <= by1;
  }
  for (let i = 0; i < xs.length - 1; i++) {
    if (segmentHitsBox(xs[i], ys[i], xs[i + 1], ys[i + 1], bx0, by0, bx1, by1)) return true;
  }
  return false;
}

function segmentHitsBox(ax, ay, bx, by, x0, y0, x1, y1) {
  const dx = bx - ax;
  const dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return false;
    } else {
      const r = q[k] / p[k];
      if (p[k] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

export function groupById(data) {
  const ids = [];
  const xs = [];
  const ys = [];
  let current = null;
  let bx = [];
  let by = [];
  const flush = () => {
    xs.push(Float64Array.from(bx));
    ys.push(Float64Array.from(by));
  };
  for (const d of data) {
    if (d.id !== current) {
      if (current !== null) flush();
      ids.push(d.id);
      current = d.id;
      bx = [];
      by = [];
    }
    bx.push(d.xCoord);
    by.push(d.yCoord);
  }
  if (current !== null) flush();
  return { ids, xs, ys };
}
