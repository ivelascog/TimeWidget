/* global d3 */ // loaded by bench/page.html
// Naive d3 SVG baseline: one <path> per series, the way a d3 tutorial builds
// it. Every frame tests every series against every brush and restyles every
// path. See canvas.js for the adapter contract.
import { groupById, polylineIntersectsBox } from "../workload.js";

const MARGIN = { left: 50, top: 30, right: 50, bottom: 50 }; // TimeWidget's default
const COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c"];
const UNSELECTED = "rgba(160,160,160,0.3)";

export default function create(container, { width, height }) {
  const iw = width - MARGIN.left - MARGIN.right;
  const ih = height - MARGIN.top - MARGIN.bottom;
  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  let series;
  let paths;
  let domains = [];
  let selected = [];

  function filter() {
    selected = domains.map(() => new Set());
    for (let s = 0; s < series.ids.length; s++) {
      for (let k = 0; k < domains.length; k++) {
        if (polylineIntersectsBox(series.xs[s], series.ys[s], domains[k])) selected[k].add(s);
      }
    }
  }

  function style() {
    paths.attr("stroke", (s) => {
      for (let k = 0; k < selected.length; k++) {
        if (selected[k].has(s)) return COLORS[k % COLORS.length];
      }
      return UNSELECTED;
    });
  }

  return {
    load(data, extent) {
      series = groupById(data);
      const sx = d3.scaleLinear().domain(extent.x).range([0, iw]);
      const sy = d3.scaleLinear().domain(extent.y).range([ih, 0]);
      const line = (s) => {
        const xs = series.xs[s];
        const ys = series.ys[s];
        let d = `M${sx(xs[0])},${sy(ys[0])}`;
        for (let i = 1; i < xs.length; i++) d += `L${sx(xs[i])},${sy(ys[i])}`;
        return d;
      };
      paths = g
        .selectAll("path")
        .data(d3.range(series.ids.length))
        .join("path")
        .attr("fill", "none")
        .attr("d", line)
        .attr("stroke", UNSELECTED);
    },
    setGroups(ds) {
      domains = ds.slice();
      filter();
      style();
    },
    move(k, domain) {
      domains[k] = domain;
      filter();
      style();
    },
    selectedCounts: () => selected.map((s) => s.size),
    breakdown: () => null,
    destroy() {
      container.replaceChildren();
    },
  };
}
