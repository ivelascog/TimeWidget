﻿import * as d3 from "d3"
import "d3-array";
import "d3-scale"
import "d3-scale-chromatic"
import {throttle} from "throttle-debounce";
import {createPopper} from "@popperjs/core"

function TimeSearcher(selectionOverview,
                      selectionDetailed,
                      _xAttr,
                      _yAttr,
                      _indexAttr,
                      _renderer = "canvas",
                      _overviewWidth = 1200,
                      _detailedWidth = 1200 - 20,
                      _overviewHeight = 600,
                      _detailedHeight = _overviewHeight / 2,
                      _detailedContainerHeight = 400) {
    let ts = this || {},
        data,
        groupedData,
        fData,
        nGroups,
        xAttr = _xAttr,
        yAttr = _yAttr,
        indexAttr = _indexAttr,
        renderer = _renderer,
        overviewWidth = _overviewWidth,
        detailedWidth = _detailedWidth,
        overviewHeight = _overviewHeight,
        detailedHeight = _detailedHeight,
        detailedContainerHeight = _detailedContainerHeight,
        overviewX,
        overviewY,
        detailedX,
        detailedY,
        line2,
        line2Detailed,
        render,
        renderObject,
        prerenderDetailed,
        divOverview,
        divRender,
        divControls,
        divDetailed,
        svg,
        g,
        gGroupBrushes,
        gBrushes,
        gEditbrushes,
        gReferences,
        brushesGroup,
        brushGroupSelected,
        brushCount,
        brushSize,
        brushTooltipElement,
        brushTooltip,
        brushSpinBoxes,
        brushInSpinBox,
        tooltipCoords = {x: 0, y: 0},
        BVH,
        dataSelected,
        dataNotSelected,
        tBrushed,
        tShowTooltip,
        tUpdateSelection,
        tUpdateBrushSpinBox,
        gGroupData,
        selectedGroupData,
        nGroupsData,
        updateCallback = function (data) {},
        statusCallback = function (status){}


    // Default Parameters
    ts.xPartitions = 10;
    ts.yPartitions = 10;
    ts.defaultAlpha = 1;
    ts.selectedAlpha = 1;
    ts.noSelectedAlpha = 0.1;
    ts.backgroundColor = "#ffffff"
    ts.defaultColor = "#000000"
    ts.selectedColor = "#000000"
    ts.noSelectedColor = "#808080"
    ts.hasDetailed = true;
    ts.margin = {left: 50, top: 30, bottom: 50, right: 20};
    ts.colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    ts.brushesColorScale = d3.scaleOrdinal(d3.schemeCategory10);
    ts.groupAttr = null;
    ts.doubleYlegend = false;
    ts.showGrid = false;
    ts.showBrushTooltip = true;
    ts.autoUpdate = true;
    ts.brushGruopSize = 15
    ts.stepX = 1;
    ts.stepY = 1;


    divOverview = selectionOverview.style("display","flex").style("background-color",ts.backgroundColor).node();
    divDetailed = selectionDetailed
    divDetailed = divDetailed
        .attr("id", "detail")
        .style("height", `${detailedContainerHeight}px`)
        .style("width", `${overviewWidth + 40}px`)
        .style("overflow-y", "scroll")
        .node()
    brushesGroup = [];
    brushGroupSelected = 0;
    brushCount = 0;
    brushSize = 0;
    dataSelected = []
    selectedGroupData = new Set()
    nGroupsData = 0;

    tBrushed = throttle(250, brushed)
    tShowTooltip = throttle(50, showBrushTooltip)
    tUpdateSelection = throttle(100, updateSelection)
    tUpdateBrushSpinBox = throttle(50, updateBrushSpinBox)

    ts.observer = new IntersectionObserver(onDetailedScrolled, {
        root: divDetailed,
        threshold: 0.1
    });

    function init() {
        //CreateOverView
        divControls = d3.select(divOverview)
            .append("div")
            .attr("id", "controls")
            .style("margin-top", `${ts.margin.top}px`)

        divRender = d3.select(divOverview)
            .append("div")
            .attr("id", "render")
            .style("position", "relative")
            .style("z-index",1)

        svg = divRender
            .append("svg")
            .attr("viewBox", [0, 0, overviewWidth, overviewHeight])
            .attr("height", overviewHeight)
            .attr("width", overviewWidth)

        const g = svg
            .append("g")
            .attr("class", "gDrawing")
            .attr("transform", `translate(${ts.margin.left}, ${ts.margin.top})`)
            .attr("tabindex", 0)
            .style("pointer-events", "all")
            .style("outline", "-webkit-focus-ring-color solid 0px")
            .on("keydown", (e) => {
                e.preventDefault()
                switch (e.key) {
                    case "+":
                        addBrushGroup()
                        break;
                    case "ArrowRight":
                        onArrowRigth(e)
                        break;
                    case "ArrowLeft":
                        onArrowLeft(e)
                        break;
                    case "ArrowUp":
                        onArrowUp(e)
                        break
                    case "ArrowDown":
                        onArrowDown(e)
                        break
                }
            });

        let gmainY = g.append("g")
            .attr("class", "mainYAxis")
            .call(d3.axisLeft(overviewY))
            .style("pointer-events", "none");

        if (ts.doubleYlegend) {
            g.append("g")
                .attr("class", "secondYaxis")
                .call(d3.axisRight(overviewY))
                .attr("transform", `translate(${overviewWidth - ts.margin.left - ts.margin.right},0)`)
                .style("pointer-events", "none")
        }

        let gmainx = g.append("g")
            .attr("class", "mainXAxis")
            .call(d3.axisBottom(overviewX))

            .attr(
                "transform",
                `translate(0, ${overviewHeight - ts.margin.top - ts.margin.bottom})`
            )
            .call((axis) =>
                axis
                    .append("text")
                    .text(xAttr)
                    .attr(
                        "transform",
                        `translate(${overviewWidth - ts.margin.right - ts.margin.left - 5}, -10 )`
                    )
                    .style("fill", "black")
                    .style("text-anchor", "end")
                    .style("pointer-events", "none")
            )
            .style("pointer-events", "none");

        gReferences = g.append("g")
            .attr("class", "gReferences")
            .style("pointer-events", "none")

        if (ts.showGrid) {
            gmainY.selectAll("g.tick")
                .append("line")
                .attr("class", "gridline")
                .attr("x1", 0)
                .attr("y1", 0)
                .attr("x2", overviewWidth - ts.margin.right - ts.margin.left)
                .attr("y2", 0)
                .attr("stroke", "#9ca5aecf") // line color
                .attr("stroke-dasharray", "4") // make it dashed;;

            gmainx.selectAll("g.tick")
                .append("line")
                .attr("class", "gridline")
                .attr("x1", 0)
                .attr("y1", -overviewHeight + ts.margin.top + ts.margin.bottom)
                .attr("x2", 0)
                .attr("y2", 0)
                .attr("stroke", "#9ca5aecf") // line color
                .attr("stroke-dasharray", "4") // make it dashed;
        }

        gGroupData = svg.append("g")
            .attr("class", "groupData")
            .attr("transform", `translate(10,${ts.margin.top} )`)


        if (ts.groupAttr) {
            fData.forEach(d => selectedGroupData.add(d[ts.groupAttr]))
            nGroupsData = selectedGroupData.size;
        }

        gEditbrushes = svg.append("g")
            .attr("class","editBrushes")


        gGroupBrushes = svg.append("g")
            .attr("class", "colorBrushes")
            .attr("transform", `translate(${ts.margin.left + 10},${ts.margin.top - ts.brushGruopSize - 5} )`);

        gGroupBrushes
            .append("text")
            .attr("x",0)
            .attr("y",ts.brushGruopSize / 2 + 2)
            .text("Brush groups: ")

        return g;
    }

    function updateBrushSpinBox({selection, sourceEvent}, brush) {

        brushInSpinBox = brush;

        let [[x0, y0], [x1, y1]] = selection;
        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        sx0.node().value = overviewX.invert(x0).toFixed(2)
        sx1.node().value = overviewX.invert(x1).toFixed(2)
        sy0.node().value = overviewY.invert(y1).toFixed(2)
        sy1.node().value = overviewY.invert(y0).toFixed(2)
    }

    function emptyBrushSpinBox() {
        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        sx0.node().value = ""
        sx1.node().value = ""
        sy0.node().value = ""
        sy1.node().value = ""

        brushInSpinBox = null;
    }

    function generateInteractionDiv() {

        if (ts.groupAttr) {
            let divData = divControls.append("div")

            divData.append("span")
                .text("Data groups: ")

            let divButtons = divData.selectAll(".groupData")
                .data(selectedGroupData)
                .join("div")
                .attr("class", "groupData")
            divButtons.append("button")
                .style("font-size", `${ts.brushGruopSize}px`)
                .style("stroke", "black")
                .style("margin", "2px")
                .style("margin-right", "10px")
                .style("border-width", "3px")
                .style("border", "solid black")
                .style("width", `${ts.brushGruopSize}px`)
                .style("height", `${ts.brushGruopSize}px`)
                .style("background-color", (d) => ts.colorScale(d))
                .on("click", function (event, d) {
                    if (selectedGroupData.has(d)) {
                        selectedGroupData.delete(d)
                        d3.select(this)
                            .style("border", "solid transparent")
                    } else {
                        selectedGroupData.add(d);
                        d3.select(this)
                            .style("border", "solid black")
                    }
                    brushFilterRender()
                })
            divButtons.append("span").text(d => d)
        }

        let divBrushes = divControls.append("div")
        divBrushes.append("span")
            .text("Brush Coordinates: ")
        let divX = divBrushes.append("div")

        divX.append("span")
            .text("X:")

        let divInputX = divX.append("div")

        let domainX = overviewX.domain()
        let x0 = divInputX.append("input")
            .attr("type", "number")
            .attr("min", domainX[0])
            .attr("max", domainX[1])
            .attr("step",ts.stepX)
            .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange)

        let x1 = divInputX.append("input")
            .attr("type", "number")
            .attr("min", domainX[0])
            .attr("max", domainX[1])
            .attr("step",ts.stepX)
            .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange)

        let divY = divBrushes.append("div")

        divY.append("span")
            .text("Y:")

        let divInputY = divY.append("div")

        let domainY = overviewY.domain()

        let y0 = divInputY.append("input")
            .attr("type", "number")
            .attr("min", domainY[0])
            .attr("max", domainY[1])
            .attr("step",ts.stepY)
            .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange)


        let y1 = divInputY.append("input")
            .attr("type", "number")
            .attr("min", domainY[0])
            .attr("max", domainY[1])
            .attr("step",ts.stepY)
            .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange)

        brushSpinBoxes = [[x0, y0], [x1, y1]]
    }

    function onSpinboxChange(sourceEvent) {
        if (brushInSpinBox === null) return

        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        let x0 = +sx0.node().value
        let x1 = +sx1.node().value
        let y0 = +sy1.node().value
        let y1 = +sy0.node().value

        if ( x0 >= x1 ) {
            if (sourceEvent.target === sx0.node()) {
                x0 = x1 - ts.stepX;
                sx0.node().value = x0
            } else {
                x1 = x0 + ts.stepX;
                sx1.node().value = x1;
            }
        }
        if ( y1 >= y0 ) {
            if (sourceEvent.target === sy0.node()) {
                y0 = y1 - ts.stepY
                sy1.node().value = y0
            } else {
                y1 = y0 - ts.stepY
                sy0.node().value = y1
            }
        }

        x0 = overviewX(x0)
        x1 = overviewX(x1)
        y0 = overviewY(y0)
        y1 = overviewY(y1)

        gBrushes.select("#brush-" + brushInSpinBox[0]).call(brushInSpinBox[1].brush.move, [
            [x0, y0],
            [x1, y1]
        ])

        let selection = [[x0, y0], [x1, y1]]

        brushed({selection, sourceEvent}, brushInSpinBox)

        //moveSelectedBrushes({selection,sourceEvent},brushInSpinBox)
    }

    function onArrowRigth(sourceEvent) {
        if (brushInSpinBox === null) return

        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        let x0 = +sx0.node().value
        let x1 = +sx1.node().value
        let y0 = +sy1.node().value
        let y1 = +sy0.node().value

        x1 += ts.stepX
        
        let maxX = +sx0.node().max

        if (x1 > maxX) {
            let dist = maxX - x1 + ts.stepX
            x1 = maxX
            x0 -= dist
        } else {
            x0 += ts.stepX
        }

        sx0.node().value = x0;
        sx1.node().value = x1;

        x0 = overviewX(x0)
        x1 = overviewX(x1)
        y0 = overviewY(y0)
        y1 = overviewY(y1)

        gBrushes.select("#brush-" + brushInSpinBox[0]).call(brushInSpinBox[1].brush.move, [
            [x0, y0],
            [x1, y1]
        ])

        let selection = [[x0, y0], [x1, y1]]

        brushed({selection, sourceEvent}, brushInSpinBox)

    }

    function onArrowLeft(sourceEvent) {
        if (brushInSpinBox === null) return

        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        let x0 = +sx0.node().value
        let x1 = +sx1.node().value
        let y0 = +sy1.node().value
        let y1 = +sy0.node().value

        x0 -= ts.stepX
        let minX = +sx0.node().min

        if (x0 < minX) {
            let dist = x0 + ts.stepX - minX
            x0 = minX
            x1 -= dist
        } else {
            x1 -= ts.stepX
        }

        sx0.node().value = x0;
        sx1.node().value = x1;

        x0 = overviewX(x0)
        x1 = overviewX(x1)
        y0 = overviewY(y0)
        y1 = overviewY(y1)

        gBrushes.select("#brush-" + brushInSpinBox[0]).call(brushInSpinBox[1].brush.move, [
            [x0, y0],
            [x1, y1]
        ])

        let selection = [[x0, y0], [x1, y1]]

        brushed({selection, sourceEvent}, brushInSpinBox)
    }

    function onArrowDown(sourceEvent) {
        if (brushInSpinBox === null) return

        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        let x0 = +sx0.node().value
        let x1 = +sx1.node().value
        let y0 = +sy1.node().value
        let y1 = +sy0.node().value

        y1 -= ts.stepY
        
        let minY = +sy0.node().min

        if (y1 < minY) {
            let dist = y1 + ts.stepY - minY
            y1 = minY
            y0 -= dist
        } else {
            y0 -= ts.stepY
        }

        sy0.node().value = y1;
        sy1.node().value = y0;

        x0 = overviewX(x0)
        x1 = overviewX(x1)
        y0 = overviewY(y0)
        y1 = overviewY(y1)

        gBrushes.select("#brush-" + brushInSpinBox[0]).call(brushInSpinBox[1].brush.move, [
            [x0, y0],
            [x1, y1]
        ])

        let selection = [[x0, y0], [x1, y1]]

        brushed({selection, sourceEvent}, brushInSpinBox)
    }

    function onArrowUp(sourceEvent) {
        if (brushInSpinBox === null) return

        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        let x0 = +sx0.node().value
        let x1 = +sx1.node().value
        let y0 = +sy1.node().value
        let y1 = +sy0.node().value

        y0 += ts.stepY
        
        let maxY = +sy0.node().max

        if (y0 > maxY) {
            let dist = maxY - y0 + ts.stepY
            y0 = maxY
            y1 += dist
        } else {
            y1 += ts.stepY
        }

        sy0.node().value = y1;
        sy1.node().value = y0;

        x0 = overviewX(x0)
        x1 = overviewX(x1)
        y0 = overviewY(y0)
        y1 = overviewY(y1)

        gBrushes.select("#brush-" + brushInSpinBox[0]).call(brushInSpinBox[1].brush.move, [
            [x0, y0],
            [x1, y1]
        ])

        let selection = [[x0, y0], [x1, y1]]

        brushed({selection, sourceEvent}, brushInSpinBox)
    }



    ts.addReferenceCurves = function (curves) {
        curves.forEach(c => {
            let [xmin, xmax] = overviewX.domain()
            let [ymin, ymax] = overviewY.domain()
            c.data = c.data.filter(point => {
                return point[0] <= xmax && point[0] >= xmin &&
                    point[1] <= ymax && point[1] >= ymin
            });
        })

        let line2 = d3.line()
            .x(d => overviewX(d[0]))
            .y(d => overviewY(d[1]))

        gReferences
            .selectAll(".referenceCurve")
            .data(curves)
            .join("path")
            .attr("class", "referenceCurve")
            .attr("d", (c) => line2(c.data))
            .attr("stroke-width", 2)
            .style("fill", "none")
            .style("stroke", (c) => c.color)
            .style("opacity", (c) => c.opacity)
    }

    ts.updateCallback = function (_) {
        return arguments.length ? ((updateCallback = _), ts) : updateCallback;
    };

    ts.statusCallback = function (_){
        return arguments.length ? ((statusCallback = _), ts) : statusCallback;

    }

    ts.Data = function (_data) {
        data = _data;
        fData = data.filter(d => d[yAttr] && d[xAttr])
        groupedData = d3.group(fData, (d) => d[indexAttr]);
        groupedData = Array.from(groupedData);

        let xDataType = typeof (fData[0][xAttr])
        if (xDataType === "object" && fData[0][xAttr] instanceof Date) {
            overviewX = d3
                .scaleTime()
                .domain(d3.extent(fData, (d) => d[xAttr]))
                .range([0, overviewWidth - ts.margin.right - ts.margin.left])

            detailedX = d3
                .scaleTime()
                .domain(d3.extent(fData, (d) => d[xAttr]))
                .range([0, detailedWidth - ts.margin.right - ts.margin.left]);
        } else if (xDataType === "number") {
            overviewX = d3
                .scaleLinear()
                .domain(d3.extent(fData, (d) => d[xAttr]))
                .range([0, overviewWidth - ts.margin.right - ts.margin.left])
            //.nice();

            detailedX = d3
                .scaleLinear()
                .domain(d3.extent(fData, (d) => d[xAttr]))
                .range([0, detailedWidth - ts.margin.right - ts.margin.left]);
        }

        overviewY = d3
            .scaleLinear()
            .domain(d3.extent(fData, (d) => d[yAttr]))
            .range([overviewHeight - ts.margin.top - ts.margin.bottom, 0])
            .nice();


        detailedY = d3
            .scaleLinear()
            .domain(d3.extent(fData, (d) => d[yAttr]))
            .range([detailedHeight - ts.margin.top - ts.margin.bottom, 0])
            .nice();

        line2 = d3
            .line()
            .x((d) => overviewX(d[xAttr]))
            .y((d) => overviewY(d[yAttr]));

        line2Detailed = d3
            .line()
            .x((d) => detailedX(d[xAttr]))
            .y((d) => detailedY(d[yAttr]));

        BVH = makeBVH(
            groupedData,
            ts.xPartitions,
            ts.yPartitions,
            overviewWidth,
            overviewHeight
        );

        g = init();
        gBrushes = g.append("g").attr("id", "brushes");
        createBrushTooltip();

        renderObject =
            renderer === "canvas" ? renderCanvas(groupedData) : renderSVG();
        render = renderObject.render;
        if (ts.hasDetailed) {
            prerenderDetailed = renderObject.preRender;
        }

        generateInteractionDiv()

        addBrushGroup();
        dataSelected[0] = groupedData
        newBrush();
        drawBrushes();

        updateCallback([])
        selectBrushGroup(0)
    }

    function onDetailedScrolled(entries, observer) {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                let div = entry.target;
                let group = div.getAttribute("group");
                group = typeof (groupedData[0][0]) === 'number' ? +group : group;
                div.appendChild(prerenderDetailed.get(group).node());
            } else {
                entry.target.innerHTML = "";
            }
        });
    }

    function renderSVG() {
        const gData = g.append("g").attr("id", "gData");
        let prerenderDetailed = null;

        function render(data) {
            renderOverviewSVG(data);
            renderDetailedSVG(data);
        }

        function renderOverviewSVG(data) {
            // const g = d3.select(chart).select(".gDrawing");
            let flatData = data.map((d) => d[1]).flat();

            gData
                .selectAll(".point")
                .data(flatData, (d) => d.__id__)
                .join(
                    (enter) => {
                        enter
                            .append("circle")
                            .attr("class", "point")
                            .attr("cy", (d) => overviewY(d[yAttr]))
                            .attr("cx", (d) => overviewX(d[xAttr]))
                            .attr("fill", "black")
                            .attr("r", 2)
                            .style("opacity", 1.0);
                    },
                    (update) => {
                        update.attr("fill", "black").style("opacity", 1.0);
                    },
                    (exit) => {
                        exit.attr("fill", "gray").style("opacity", 0.1);
                    }
                );

            let lines = gData
                .selectAll(".line")
                .data(data, (d) => d[0])
                .join(
                    (enter) => {
                        enter
                            .append("path")
                            .attr("class", "line")
                            .attr("d", (g) => line2(g[1]))
                            .style("fill", "none")
                            .style("stroke", "black")
                            .style("opacity", 1.0);
                    },
                    (update) => {
                        update.style("stroke", "black").style("opacity", 1.0);
                    },
                    (exit) => {
                        exit.style("stroke", "gray").style("opacity", 0.1);
                    }
                );
        }

        function renderDetailedSVG(data) {
            const div = d3.select(divDetailed);

            div
                .selectAll(".detailed")
                .data(data, (d) => d[0])
                .join(
                    (enter) => {
                        enter.each(function (d) {
                            let g = d3
                                .select(this)
                                .append("svg")
                                .attr("class", "detailed")
                                .attr("viewBox", [0, 0, detailedWidth, detailedHeight])
                                .attr("height", detailedHeight)
                                .attr("width", detailedWidth)
                                .append("g");
                            g.attr("transform", `translate(${ts.margin.left}, ${ts.margin.top})`);

                            g.append("g")
                                .attr("class", "mainYAxis")
                                .call(d3.axisLeft(detailedY));

                            g.append("g")
                                .attr("class", "mainXAxis")
                                .call(d3.axisBottom(detailedX))
                                .attr(
                                    "transform",
                                    `translate(0, ${detailedHeight - ts.margin.top - ts.margin.bottom})`
                                );

                            g.append("text")
                                .text(d[0])
                                .attr("transform", `translate(10, 0)`)
                                .style("fill", "black")
                                .style("font-size", "0.7em");

                            g.selectAll(".point") //.select("#points") //TODO make new G with id for this cricles
                                .data(d[1])
                                .join("circle")
                                .attr("class", "point")
                                .attr("cy", (d) => detailedY(d[yAttr]))
                                .attr("cx", (d) => detailedX(d[xAttr]))
                                .attr("fill", "black")
                                .attr("r", 2);

                            g.selectAll(".lines") //TODO add to the new G
                                .data([d])
                                .join("path")
                                .attr("class", "line")
                                .attr("d", (g) => line2Detailed(g[1]))
                                .style("fill", "none")
                                .style("stroke", "black");
                        });
                    },
                    (update) => update,
                    (exit) => exit.remove()
                );
        }

        return {render: render, preRender: prerenderDetailed};
    }

    function renderCanvas(data) {
        const canvas = divRender
            .append("canvas")
            .attr("height", overviewHeight * window.devicePixelRatio)
            .attr("width", overviewWidth * window.devicePixelRatio)
            .style("position", "absolute")
            .style("z-index", "-1")
            .style("top", `${ts.margin.top}px`)
            .style("left", `${ts.margin.left}px`)
            .style("width", `${overviewWidth}px`)
            .style("height", `${overviewHeight}px`)
            .style("pointer-events", "none");

        const context = canvas.node().getContext("2d");
        canvas.node().onmousemove = (event) => {
            console.log("canvas");
        };

        // For retina display
        context.scale(window.devicePixelRatio, window.devicePixelRatio);

        let paths = new Map();
        data.forEach((d) => {
            let group = ts.groupAttr ? d[1][0][ts.groupAttr] : null
            let pathObject = {path: new Path2D(line2(d[1])), group: group}
            paths.set(d[0], pathObject);
        });

        prerenderDetailed = ts.hasDetailed ? generatePrerenderDetailed(data) : null;


        function render(dataSelected, dataNotSelected) {
            renderOverviewCanvas(dataSelected, dataNotSelected);
            if (ts.hasDetailed) {
                window.requestAnimationFrame(() => renderDetailedCanvas(dataSelected));
            }
        }

        function renderOverviewCanvas(dataSelected, dataNotSelected) {
            context.clearRect(0, 0, canvas.node().width, canvas.node().height);
            if (brushSize === 0) {
                context.globalAlpha = ts.defaultAlpha;
                dataSelected[0].forEach(d => {
                    let path = paths.get(d[0]);
                    context.strokeStyle = ts.groupAttr ? ts.colorScale(path.group) : ts.defaultColor;
                    context.stroke(path.path)
                })
            } else {
                context.globalAlpha = ts.selectedAlpha;
                dataSelected[brushGroupSelected].forEach(d => {
                    let path = paths.get(d[0])
                    context.strokeStyle = ts.groupAttr ? ts.colorScale(path.group) : ts.selectedColor;
                    context.stroke(path.path)

                })

                dataSelected.forEach((g,i) => {
                    if (i !== brushGroupSelected) {
                       dataNotSelected = dataNotSelected.concat(g)
                    }
                })

                context.globalAlpha = ts.noSelectedAlpha;
                dataNotSelected.forEach(d => {
                    let path = paths.get(d[0])
                    context.strokeStyle = ts.groupAttr ? ts.colorScale(path.group) : ts.noSelectedColor;
                    context.stroke(path.path)
                })
            }
        }

        function renderDetailedCanvas(data) {
            let frag = document.createDocumentFragment();

            data[brushGroupSelected].forEach((d) => {
                let div = document.createElement("div");
                div.className = "detailedContainer";
                div.setAttribute("group", d[0]);
                div.style.height = `${detailedHeight}px`;
                frag.appendChild(div);
            });

            // removed to reduce flickering
            // divDetailed.innerHTML = "";

            // Observer API To only show in the detailed view the divs that are visible
            window.requestIdleCallback(() => {
                divDetailed.replaceChildren(frag);
                divDetailed.querySelectorAll(".detailedContainer").forEach((d) => {
                    ts.observer.observe(d);
                });
            });
        }

        function generatePrerenderDetailed(data) {
            let prerenderDetailed = new Map();
            data.forEach((d) => {
                let div = d3
                    .create("div")
                    .attr("class", "detailed")
                    .style("position", "relative");

                let g = div
                    .append("svg")
                    .attr("viewBox", [0, 0, detailedWidth, detailedHeight])
                    .attr("height", detailedHeight)
                    .attr("width", detailedWidth)
                    .append("g")
                    .attr("class", "gDrawing")
                    .attr("transform", `translate(${ts.margin.left}, ${ts.margin.top})`);

                g.append("g")
                    .attr("class", "detailedYAxis")
                    .call(d3.axisLeft(detailedY));

                g.append("g")
                    .attr("class", "detailedXAxis")
                    .call(d3.axisBottom(detailedX))
                    .attr(
                        "transform",
                        `translate(0, ${detailedHeight - ts.margin.top - ts.margin.bottom})`
                    );

                g.append("text")
                    .text(d[0])
                    .attr("transform", `translate(10, 0)`)
                    .style("fill", "black")
                    .style("font-size", "0.7em");

                g.append("path")
                    .attr("d", line2Detailed(d[1]))
                    .style("fill", "none")
                    .style("stroke", "black");

                /*  let canvas = div
                      .append("canvas")
                      .attr("height", detailedHeight)
                      .attr("width", detailedWidth)
                      .style("position", "absolute")
                      .style("top", `${ts.margin.top}px`)
                      .style("left", `${ts.margin.left}px`)
                      .style("pointer-events", "none");

                  let context = canvas.node().getContext("2d");
                  let path = new Path2D(line2Detailed(d[1]));
                  context.stroke(path); */

                prerenderDetailed.set(d[0], div);
            });
            return prerenderDetailed;
        }

        return {render: render, preRender: prerenderDetailed};
    }

    //------------- Brush section ---------- //

    function addBrushGroup() {
        dataSelected.push([])
        brushesGroup.push(new Map())
        gGroupBrushes.append("rect")
            .attr("class", "colorBrushes")
            .attr("id", "colorBrush-" + (brushesGroup.length - 1))
            .attr("height", ts.brushGruopSize)
            .attr("width", ts.brushGruopSize)
            .attr("transform", `translate(${100 + (brushesGroup.length - 1) * (ts.brushGruopSize + 5) })`)
            .style("fill", ts.brushesColorScale(brushesGroup.length - 1))
            .on("click", function (event) {
                let id = d3.select(this).attr("id").substr("11")
                selectBrushGroup(+id)
            });
        updateStatus()
    }

    function selectBrushGroup(id) {
        brushGroupSelected = id
        gGroupBrushes.selectAll("rect.colorBrushes")
            .style("stroke-width", 0)

        gGroupBrushes.select("#colorBrush-" + id)
            .style("stroke-width", 3)
            .style("stroke", "black")

        drawBrushes()
        render(dataSelected,dataNotSelected)
    }

    function createBrushTooltip() {
        brushTooltipElement = d3.select("body")
            .append("div")
            .attr("class", "__ts_popper")
            .style("pointer-events", "none")
            .style("display", "none")
            .style("z-index", 2)

        let ul = brushTooltipElement
            .append("ul");

        ul.append("li")
            .attr("class", "tool_x_text")

        ul.append("li")
            .attr("class", "tool_y_text")

        const ref = {
            getBoundingClientRect: () => {
                const svgBR = g.node().getBoundingClientRect();
                return {
                    top: tooltipCoords.y, //+ svgBR.top,
                    right: tooltipCoords.x,// + svgBR.left,
                    bottom: tooltipCoords.y, // + svgBR.top,
                    left: tooltipCoords.x, // + svgBR.left,
                    width: 0,
                    height: 0
                }
            }
        }


        brushTooltip = createPopper(ref, brushTooltipElement.node(), {
            placement: "right"
        })
    }

    function showBrushTooltip({selection, sourceEvent}) {
        if (!selection || sourceEvent === undefined) return

        let [[x0, y0], [x1, y1]] = selection;
        let textX = "X: [" + overviewX.invert(x0).toFixed(2) + ", " + overviewX.invert(x1).toFixed(2) + "]"
        let textY = "Y: [" + overviewY.invert(y1).toFixed(2) + ", " + overviewY.invert(y0).toFixed(2) + "]"


        brushTooltipElement.style("display", "initial")
        brushTooltipElement.select(".tool_x_text").text(textX)
        brushTooltipElement.select(".tool_y_text").text(textY);

        tooltipCoords.x = sourceEvent.x;
        tooltipCoords.y = sourceEvent.y;

        brushTooltip.update();
    }

    function hideTooltip(element, removed) {
        if (removed || element.style("pointer-events") === "all") {
            brushTooltipElement.style("display", "none")
        }
    }

    function brushed({selection, sourceEvent}, brush) {
        if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically

        brush[1].selection = selection;
        if (updateBrush(brush)) {
            //Update intersections with modified brush
            brushFilterRender();
            updateStatus()
        }
    }

    function endBrush({selection, sourceEvent}, brush) {
        if (sourceEvent === undefined) return
        if (selection) {
            let [[x0, y0], [x1, y1]] = selection;
            if (Math.abs(x0 - x1) < 20 && Math.abs(y0 - y1) < 20) {
                removeBrush(brush);
            } else if (!ts.autoUpdate) {
                if (brush[1].isSelected) {
                    updateSelection()
                } else {
                    brushed({selection, sourceEvent}, brush)
                }
            }
        } else {
            removeBrush(brush);
        }
        if (brush[0] === brushCount - 1) newBrush();

        drawBrushes();
    }

    function newBrush() {
        let brush = d3.brush().on("start", (e, brush) => {
            if (brush[0] === brushCount - 1) {
                brushSize++;
                brushesGroup[brush[1].group].delete(brush[0])
                brush[1].group = brushGroupSelected;
                brushesGroup[brushGroupSelected].set(brush[0],brush[1])
                drawBrushes()
            }
            if (ts.autoUpdate) {
                tBrushed(e, brush)
            }
        })
        brush.on("brush.move", moveSelectedBrushes)
        brush.on("brush.spinBox", tUpdateBrushSpinBox)

        if (ts.autoUpdate) {
            brush.on("brush.brushed", tBrushed)
        }
        if (ts.showBrushTooltip) {
            brush.on("brush.show", tShowTooltip)
        }
        brush.on("end", endBrush);
        brushesGroup[brushGroupSelected].set(brushCount, {
            brush: brush,
            intersections: new Map(),
            isSelected: false,
            group: brushGroupSelected,
            selection: null
        });
        brushCount++;
    }

    function drawBrushes() {
        let brushes = [];
        brushesGroup.forEach(d => brushes = brushes.concat(Array.from(d)));
        g.select("#brushes")
            .selectAll(".brush")
            .data(brushes, (d) => d[0])
            .join(
                (enter) => {
                    enter
                        // Insert on top of the g
                        .insert("g", ".brush")
                        .attr("class", "brush")
                        .attr("id", (d) => "brush-" + d[0])
                        .each(function (d) {
                            return d3.select(this).call(d[1].brush);
                        })
                        .each(function (d) {
                            d3.select(this)
                                .selectAll(".selection")
                                .style("outline", "-webkit-focus-ring-color solid 2px")
                                .attr("tabindex", 0)
                                .on("keydown", ({keyCode, key}) => {
                                    switch (key) {
                                        case "r":
                                        case "Backspace":
                                            removeBrush(d)
                                    }
                                })
                                .on("mousedown", (sourceEvent) => {
                                    let selection = d[1].selection
                                    updateBrushSpinBox({selection,sourceEvent},d)
                                    if (sourceEvent.shiftKey) {
                                        selectBrush(d);
                                    }
                                });
                            if (ts.showBrushTooltip) {
                                d3.select(this).selectAll(":not(.overlay)")
                                    .on("mousemove", (sourceEvent) => {
                                        let selection = d[1].selection
                                        showBrushTooltip({selection, sourceEvent})
                                    })
                                    .on("mouseout", (event) => hideTooltip(d3.select(this)), false)
                            }
                        });
                },
                (update) =>
                    update.each(function (d) {
                        d3.select(this)
                            .selectAll(".selection")
                            .style("outline-width", d[1].group === brushGroupSelected ? " 4px" : " 2px")
                            .style("outline-style",  d[1].isSelected ? "dashed" : "solid" )
                            .style("outline-color", ts.brushesColorScale(d[1].group) )
                            .style("fill", ts.brushesColorScale(d[1].group))

                    }),
                (exit) => exit.remove()
            );

        g.select("#brushes")
            .selectAll(".brush")
            .data(brushes, (d) => d[0])
            .each(function (d) {
                d3.select(this)
                    .selectAll(".overlay")
                    .style("pointer-events", () =>
                        brushCount - 1 === d[0] ? "all" : "none"
                    );
            });
    }

    function brushFilterRender() {
        dataNotSelected = [];
        dataSelected = []
        brushesGroup.forEach(() => dataSelected.push([]))

        if (brushSize > 0) {
            for (let d of groupedData) {
                if (selectedGroupData.has(d[1][0][ts.groupAttr])) {
                    let isSelected = false;
                    for (let i = 0; i < brushesGroup.length; ++i) {
                        if (intersectGroup(d, brushesGroup[i])) {
                            dataSelected[i].push(d);
                            isSelected = true;
                        }
                    }
                    if (!isSelected) {
                        dataNotSelected.push(d)
                    }
                }
            }

            updateCallback(dataSelected)
            render(dataSelected, dataNotSelected);
        } else {
            updateCallback([])
            if (ts.groupAttr) {
                dataSelected[0] = groupedData.filter( d => selectedGroupData.has(d[1][0][ts.groupAttr]))
                render(dataSelected, dataNotSelected);
            } else {
                render(groupedData, dataNotSelected);
            }
        }

        return [dataSelected, dataNotSelected];
    }

    function removeBrush(brush) {
        brushSize--;
        brushesGroup[brush[1].group].delete(brush[0])
        drawBrushes();
        brushFilterRender();
        hideTooltip(null, true)
        emptyBrushSpinBox()
    }

    function updateBrush(brush) {
        let [[x0, y0], [x1, y1]] = brush[1].selection;
        let newIntersections = inteserctBVH(BVH, x0, y0, x1, y1);
        let updated = !compareMaps(newIntersections, brush[1].intersections);
        brush[1].intersections = newIntersections;
        return updated;
    }

    function intersectGroup(data, group) {
        if (group.size === 0 || (group.size === 1 && group.values().next().value.intersections.size === 0)) return false
        let intersect = true;
        for (const brush of group) {
            intersect =
                intersect &&
                (brush[1].intersections.get(data[0]) || brush[1].intersections.size === 0);
        }
        return intersect;
    }

    function selectBrush(brush) {
        brush[1].isSelected = !brush[1].isSelected;
    }
    function deselectAllBrushes() {
        for (let brushGroup of brushesGroup) {
            for (let brush of brushGroup) {
                brush[1].isSelected = false;
            }
        }
    }

    function updateSelection() {
        let someUpdate = false;
        for (const brushGroup of brushesGroup) {
            for (const brush of brushGroup) {
                if (brush[1].isSelected) {
                    let update = updateBrush(brush) //avoid lazy evaluation
                    someUpdate = someUpdate || update
                }
            }
        }
        if (someUpdate) {
            brushFilterRender();
            updateStatus();
        }
    }


    function moveSelectedBrushes({selection, sourceEvent}, triggerBrush) {
        if (sourceEvent === undefined) return // dont execute this method when move brushes programatically
        if (!selection || !triggerBrush[1].isSelected) return

        let [[x0, y0], [x1, y1]] = selection;
        let distX = x0 - triggerBrush[1].selection[0][0];
        let distY = y0 - triggerBrush[1].selection[0][1];
        triggerBrush[1].selection = selection;
        for (const brushGroup of brushesGroup) {
            for (const brush of brushGroup) {
                if (brush[1].isSelected && !(triggerBrush[0] === brush[0])) {
                    let [[x0, y0], [x1, y1]] = brush[1].selection;
                    x0 += distX;
                    x1 += distX;
                    y0 += distY;
                    y1 += distY;
                    gBrushes.select("#brush-" + brush[0]).call(brush[1].brush.move, [
                        [x0, y0],
                        [x1, y1]
                    ]);
                    brush[1].selection = [
                        [x0, y0],
                        [x1, y1]
                    ];
                }
            }
        }

        if (ts.autoUpdate) {
            tUpdateSelection()
        }
    }

    function makeBVH(data, xPartitions, yPartitions, width, height) {
        let keys = data.map((d) => d[0]);
        let xinc = width / xPartitions;
        let yinc = height / yPartitions;
        let BVH = {
            width: width,
            height: height,
            xinc: xinc,
            yinc: yinc,
            keys: keys,
            BVH: []
        };

        for (let i = 0; i < xPartitions; ++i) {
            BVH.BVH[i] = [];
            let currentX = i * xinc;
            for (let j = 0; j < yPartitions; ++j) {
                let currentY = yinc * j;
                BVH.BVH[i][j] = {
                    x0: currentX,
                    x1: currentX + xinc,
                    y0: currentY,
                    y1: currentY + yinc,
                    data: new Map()
                };
            }
        }

        data.forEach((d) => {
            let key = d[0];
            let lastXindex = -1;
            let lastYindex = -1;
            for (let i = 0; i < d[1].length; ++i) {
                let current = d[1][i];
                let xCoor = overviewX(current[xAttr]);
                let yCoor = overviewY(current[yAttr]);
                if (xCoor != null && yCoor != null) {
                    let xIndex = Math.floor(xCoor / xinc);
                    let yIndex = Math.floor(yCoor / yinc);

                    if (i === 0) {
                        BVH.BVH[xIndex][yIndex].data.set(key, [[current]]);
                    } else {
                        if (xIndex === lastXindex && yIndex === lastYindex) {
                            BVH.BVH[xIndex][yIndex].data.get(key).at(-1).push(current);
                        } else {
                            let previousCell = BVH.BVH[lastXindex][lastYindex]
                            previousCell.data.get(key).at(-1).push(current);
                            let previous = d[1][i - 1];
                            for (let row of BVH.BVH) {
                                for (let cell of row) {
                                    if (cell !== previousCell) {
                                        if (lineIntersection([previous, current], cell.x0, cell.y0, cell.x1, cell.y1)) {
                                            if (cell.data.has(key)) {
                                                cell.data.get(key).push([previous]);
                                                cell.data.get(key).at(-1).push(current);
                                            } else {
                                                cell.data.set(key, [[previous]]);
                                                cell.data.get(key).at(-1).push(current);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                    }
                    lastXindex = xIndex;
                    lastYindex = yIndex;
                }
            }
        });
        return BVH;
    }

    function inteserctBVH(BVH, x0, y0, x1, y1) {
        //avoid overflow when brush are in the limits
        x1 = x1 === BVH.width ? x1 - 1 : x1;
        y1 = y1 === BVH.height ? y1 - 1 : y1;

        let initI = Math.floor(x0 / BVH.xinc);
        let finI = Math.floor(x1 / BVH.xinc);
        let initJ = Math.floor(y0 / BVH.yinc);
        let finJ = Math.floor(y1 / BVH.yinc);

        let intersections = new Map();
        BVH.keys.forEach((d) => intersections.set(d, false));
        for (let i = initI; i <= finI; ++i) {
            for (let j = initJ; j <= finJ; ++j) {
                for (const segments of BVH.BVH[i][j].data) {
                    if (!intersections.get(segments[0])) {
                        for (const segment of segments[1]) {
                            let intersect = lineIntersection(segment, x0, y0, x1, y1);
                            if (intersect) {
                                intersections.set(segments[0], true);
                                break;
                            }
                        }
                    }
                }
            }
        }
        return intersections;
    }

    function lineIntersection(line, x0, y0, x1, y1) {
        line = line.map((d) => [overviewX(d[xAttr]), overviewY(d[yAttr])]);
        let initPoint = line[0];

        for (let index = 1; index < line.length; ++index) {
            let finalPoint = line[index];
            let intersectX0 = (initPoint[0] <= x0 && finalPoint[0] >= x0) || (initPoint[0] >= x0 && finalPoint[0] <= x0);
            if (intersectX0) {
                let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
                let y = m * (x0 - initPoint[0]) + initPoint[1];
                let intersect = y >= y0 && y <= y1;
                if (intersect) return true;
            }

            let intersectX1 = (initPoint[0] <= x1 && finalPoint[0]) >= x1 || (initPoint[0] >= x1 && finalPoint[0] <= x1);
            if (intersectX1) {
                let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
                let y = m * (x1 - initPoint[0]) + initPoint[1];
                let intersect = y >= y0 && y <= y1;
                if (intersect) return true;
            }

            let intersectY0 = (initPoint[1] <= y0 && finalPoint[1] >= y0) || (initPoint[1] >= y0 && finalPoint[1] <= y0);
            if (intersectY0) {
                let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
                let x = (y0 - initPoint[1]) / m + initPoint[0];
                let intersect = x >= x0 && x <= x1;
                if (intersect) return true;
            }

            let intersectY1 = (initPoint[1] >= y1 && finalPoint[1] <= y1) || (initPoint[1] <= y1 && finalPoint[1] >= y1);
            if (intersectY1) {
                let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
                let x = (y1 - initPoint[1]) / m + initPoint[0];
                let intersect = x >= x0 && x <= x1;
                if (intersect) return true;
            }

            initPoint = finalPoint;
        }
        return false;
    }

    function compareMaps(map1, map2) {
        for (const [key, value] of map1) {
            if (map2.get(key) !== value) {
                return false;
            }
        }
        return true;
    }

    function updateStatus() {
        // exportColors
        let colors = []
        for (let i of ts.colorScale.domain()){
            colors.push({value: i, color:ts.colorScale(i)})
        }
        //Export brushes
        let brushGroups = []
        brushesGroup.forEach ((d,i) => {
            let brushes = []
            d.forEach( (d) => {if (d.selection) brushes.push(d.selection)})
            brushGroups.push({color: ts.brushesColorScale(i), brushes: brushes})
        })

        statusCallback({colors: colors, brushGroups: brushGroups})
    }

    divOverview.details = divDetailed;
    return ts;
}

export default TimeSearcher