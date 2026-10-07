// Naive Canvas 2D baseline: what a competent developer writes first. Every
// frame tests every series against every brush (no spatial index) and
// redraws every series from scratch (no cached paths).
import { groupById, polylineIntersectsBox } from "../workload.js";

const MARGIN = { left: 50, top: 30, right: 50, bottom: 50 }; // TimeWidget's default
const COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c"];
const UNSELECTED = "rgba(160,160,160,0.3)";

export default function create(container, { width, height }) {
  const iw = width - MARGIN.left - MARGIN.right;
  const ih = height - MARGIN.top - MARGIN.bottom;
  const canvas = document.createElement("canvas");
  canvas.width = iw;
  canvas.height = ih;
  canvas.style.margin = `${MARGIN.top}px ${MARGIN.right}px ${MARGIN.bottom}px ${MARGIN.left}px`;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let series;
  let sx;
  let sy;
  let domains = [];
  let selected = [];

  function filter() {
    selected = domains.map(() => new Set());
    for (let s = 0; s < series.ids.length; s++) {
      for (let g = 0; g < domains.length; g++) {
        if (polylineIntersectsBox(series.xs[s], series.ys[s], domains[g])) selected[g].add(s);
      }
    }
  }

  function trace(s) {
    const xs = series.xs[s];
    const ys = series.ys[s];
    ctx.moveTo(sx(xs[0]), sy(ys[0]));
    for (let i = 1; i < xs.length; i++) ctx.lineTo(sx(xs[i]), sy(ys[i]));
  }

  function draw() {
    ctx.clearRect(0, 0, iw, ih);
    const any = new Set();
    selected.forEach((set) => set.forEach((s) => any.add(s)));
    ctx.strokeStyle = UNSELECTED;
    ctx.beginPath();
    for (let s = 0; s < series.ids.length; s++) if (!any.has(s)) trace(s);
    ctx.stroke();
    selected.forEach((set, g) => {
      ctx.strokeStyle = COLORS[g % COLORS.length];
      ctx.beginPath();
      set.forEach(trace);
      ctx.stroke();
    });
  }

  return {
    load(data, extent) {
      series = groupById(data);
      sx = d3.scaleLinear().domain(extent.x).range([0, iw]);
      sy = d3.scaleLinear().domain(extent.y).range([ih, 0]);
      draw();
    },
    setGroups(ds) {
      domains = ds.slice();
      filter();
      draw();
    },
    move(g, domain) {
      domains[g] = domain;
      filter();
      draw();
    },
    selectedCounts: () => selected.map((s) => s.size),
    breakdown: () => null,
    destroy() {
      container.replaceChildren();
    },
  };
}
