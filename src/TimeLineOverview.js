import * as d3 from "d3";
import { darken } from "./utils.js";

function TimeLineOverview({
  ts,
  element,
  width = 800,
  height = 600,
  x,
  y,
  groupAttr,
}) {
  let me = {};
  let paths, overviewX, overviewY;

  const divOverview = d3
    .select(element)
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("position", "relative")
    .style("top", "0px")
    .style("left", "0px")
    .style("background-color", ts.backgroundColor);

  let line = d3.line()
    .defined((d) => y(d) !== undefined && y(d) !== null);
  
  let linem = d3.line();

  const canvas = divOverview
    .selectAll("canvas")
    .data([1])
    .join("canvas")
    .attr("height", height * window.devicePixelRatio)
    .attr("width", width * window.devicePixelRatio)
    .style("position", "absolute")
    .style("z-index", "-1")
    .style("top", `${ts.margin.top}px`)
    .style("left", `${ts.margin.left}px`)
    .style("width", `${width}px`)
    .style("height", `${height}px`)
    .style("pointer-events", "none");

  const context = canvas.node().getContext("2d");
  context.scale(window.devicePixelRatio, window.devicePixelRatio);
  //context.globalCompositeOperation = "lighter";

  me.data = function (data) {
    paths = new Map();
    data.forEach((d) => {
      let group = groupAttr ? groupAttr(d[1][0]) : null;
      let pathObject = { path: new Path2D(line(d[1])), group: group };
      paths.set(d[0], pathObject);
    });
  };

  me.setScales = function ({ scaleX, scaleY }) {
    overviewX = scaleX;
    overviewY = scaleY;

    line = line.x((d) => overviewX(+x(d))).y((d) => overviewY(y(d)));
    linem = linem.x((d) => overviewX(d[0])).y((d) => overviewY(d[1]));
  };

  function renderOvwerview(
    dataSelected,
    groupSelected,
    dataNotSelected,
    medians,
    hasSelection
  ) {
    dataNotSelected = dataNotSelected ? dataNotSelected : [];
    context.clearRect(0, 0, canvas.node().width, canvas.node().height);

    if (!hasSelection) {
      // Render all
      renderOverviewCanvasSubset(
        dataNotSelected,
        ts.defaultAlpha,
        ts.defaultColor
      );
    } else {
      context.lineWidth = 1;

      // Render Non selected
      renderOverviewCanvasSubset(
        dataNotSelected,
        ts.noSelectedAlpha,
        ts.noSelectedColor
      );

      dataSelected.forEach((data, group) => {
        if (group !== groupSelected) {
          let selectedColor = computeColor(group);
          console.log(
            "Render selected selectedColor",
            selectedColor,
            group
          );

          // Render selected
          renderOverviewCanvasSubset(
            data,
            ts.selectedAlpha,
            selectedColor.toString(),
            group
          );
        }
      });

      renderOverviewCanvasSubset(
        dataSelected.get(groupSelected),
        ts.selectedAlpha,
        computeColor(groupSelected).toString(),
        groupSelected
      );

      // TODO configs for this
      /*childSelections.forEach((selection, childIx) => {
      if (childPosition !== childIx) {
        let selection = childSelections[childIx];
        selection.forEach((group, id) => {
          let color = d3.hsl(ts.brushesColorScale(id));
          color.s = 1;
          color.l = lums[childIx]; //initLum + LStep * (childSelections.length - 1 - childIx);
          renderOverviewCanvasSubset(group, ts.selectedAlpha, color);
        });
      }
    }); */

      context.save();
      // Render group Medians
      if (medians) {
        context.lineWidth = ts.medianLineWidth;
        context.globalAlpha = ts.medianLineAlpha;

        medians.forEach((d) => {
          if (!d[1]) {
            console.log("Error drawing medians, empty data", d);
            return;
          }
          let path = new Path2D(linem(d[1]));
          context.setLineDash(ts.medianLineDash);
          context.strokeStyle = darken(computeColor(d[0]));
          context.stroke(path);
        });
      }
      context.restore();
    }
  }

  function computeColor(groupId) {
    return ts.brushesColorScale(groupId);
  }

  // Pass a groupId when rendering a highlighted selection for a group
  function renderOverviewCanvasSubset(
    dataSubset,
    alpha,
    color,
    groupId = null
  ) {
    if (!dataSubset) {
      console.log("🚫 Error renderOverviewCanvasSubset called with no dataSubset", dataSubset);
      return;
    }

    //context.save();
    // Compute the transparency with respect to the number of lines drawn
    // Min 0.05, then adjust by the expected alpha divided by 10% of the number of lines
    // context.globalAlpha = 0.05 + alpha / (dataSubset.length * 0.1);
    context.globalAlpha = alpha * ts.alphaScale(dataSubset.length);

    

    for (let d of dataSubset) {
      let path = paths.get(d[0]);
      if (!path) {
        console.log("renderOverviewCanvasSubset error finding path", d[0], d);
        return;
      }
      let strokeColor = color;
      if (groupAttr) {
        const baseGroupColor = ts.colorScale(path.group);
        strokeColor = ts.selectedColorTransform(baseGroupColor, groupId);

        // const { h, c, l, opacity } = d3.lch(baseGroupColor);
        // strokeColor = d3.lch(l + ts.brushesColorScale(groupId), c, h, opacity);
        // console.log(
        //   "group",
        //   groupId,

        //   "baseGroupColor",
        //   baseGroupColor,
        //   h,
        //   s,
        //   l,
        //   o,

        //   "after",
        //   strokeColor
        // );
      }
      // context.strokeStyle = groupAttr ? ts.colorScale(path.group) : color;
      context.strokeStyle = "" + strokeColor;
      context.stroke(path.path);
    }
  }

  me.render = function (
    dataSelected,
    groupSelected,
    dataNotSelected,
    medians,
    hasSelection
  ) {
    renderOvwerview(
      dataSelected,
      groupSelected,
      dataNotSelected,
      medians,
      hasSelection
    );
  };

  return me;
}

export default TimeLineOverview;
