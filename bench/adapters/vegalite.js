/* global vegaEmbed */ // loaded by bench/page.html
// Vega-Lite baseline, written the way a general-purpose grammar is used for
// this task: a grey line per series with one interval param per brush group,
// plus one highlight layer per group showing the series with any point inside
// that brush. Canvas renderer. See canvas.js for the adapter contract.
//
// Semantics differ from TimeWidget: Vega-Lite can only test points against an
// interval, not line segments, so a series whose segment crosses the brush
// without a vertex inside it is not selected here.
//
// Brushes are set through the param's pixel signals (brushK_x / brushK_y),
// which Vega-Lite compiles into brushK_xCoord -> brushK_tuple -> brushK_store,
// the same path a pointer drag takes.
const MARGIN = { left: 50, top: 30, right: 50, bottom: 50 }; // TimeWidget's default
const COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c"];

export default function create(container, { width, height }) {
  const iw = width - MARGIN.left - MARGIN.right;
  const ih = height - MARGIN.top - MARGIN.bottom;
  let view = null;
  let data;
  let extent;
  let groups = 0;

  function spec(nGroups) {
    const encoding = {
      x: { field: "xCoord", type: "quantitative", scale: { domain: extent.x, nice: false, zero: false } },
      y: { field: "yCoord", type: "quantitative", scale: { domain: extent.y, nice: false, zero: false } },
      detail: { field: "id" },
    };
    const params = [];
    for (let k = 0; k < nGroups; k++) {
      params.push({ name: `brush${k}`, select: { type: "interval", encodings: ["x", "y"], clear: false } });
    }
    const highlight = (k) => ({
      transform: [
        { calculate: `vlSelectionTest('brush${k}_store', datum) ? 1 : 0`, as: "in" },
        { joinaggregate: [{ op: "max", field: "in", as: "hit" }], groupby: ["id"] },
        { filter: "datum.hit === 1" },
      ],
      mark: { type: "line", strokeWidth: 1, color: COLORS[k % COLORS.length] },
      encoding,
    });
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: iw,
      height: ih,
      autosize: "none",
      padding: MARGIN,
      data: { values: data },
      layer: [
        { params, mark: { type: "line", strokeWidth: 1, color: "#a0a0a0", opacity: 0.3 }, encoding },
        ...Array.from({ length: nGroups }, (_, k) => highlight(k)),
      ],
    };
  }

  function setPixels(k, domain) {
    const [[x0, yHigh], [x1, yLow]] = domain;
    const sx = view.scale("x");
    const sy = view.scale("y");
    view.signal(`brush${k}_x`, [sx(x0), sx(x1)]).signal(`brush${k}_y`, [sy(yHigh), sy(yLow)]);
  }

  return {
    load(d, ext) {
      data = d;
      extent = ext;
    },
    // The spec depends on the number of groups, so the chart is built here;
    // the driver's load time therefore covers Vega's parse and first render.
    async setGroups(domains) {
      groups = domains.length;
      const result = await vegaEmbed(container, spec(groups), { renderer: "canvas", actions: false });
      view = result.view;
      for (let k = 0; k < groups; k++) setPixels(k, domains[k]);
      await view.runAsync();
    },
    async move(k, domain) {
      setPixels(k, domain);
      await view.runAsync();
    },
    // Series Vega actually drew in each highlight layer: the item count of
    // its per-series path group. A brush that never reached Vega's store, or
    // a highlight layer that did not re-render, shows up as 0.
    selectedCounts() {
      const counts = new Array(groups).fill(0);
      (function walk(node) {
        if (!node) return;
        const m = node.marktype === "group" && /^layer_(\d+)_pathgroup$/.exec(node.name || "");
        if (m && +m[1] >= 1 && +m[1] <= groups) counts[+m[1] - 1] = node.items.length;
        (node.items || []).forEach(walk);
      })(view.scenegraph().root);
      return counts;
    },
    breakdown: () => null,
    destroy() {
      if (view) view.finalize();
      container.replaceChildren();
    },
  };
}
