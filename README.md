<h1 align="center">
  <br>
  TimeWidget
  <br>
</h1>
<h4 align="center">A tool that summarizes and explores temporal data sets with quantitative values</h4>
You can use it to visualize thousands of time series, and select multiple groups by direct manipulation. In addition, it
works as a reactive widget that can be added to other applications, returning the selected groups in real time.

|                                                Group Selection                                                 |                                                      Detailed View                                                      |
|:--------------------------------------------------------------------------------------------------------------:|:-----------------------------------------------------------------------------------------------------------------------:|
|  <img src="https://raw.githubusercontent.com/ivelascog/TimeWidget/main/imgs/TimeWidget_groupSelection.gif"/>   |        <img src="https://raw.githubusercontent.com/ivelascog/TimeWidget/main/imgs/TimeWidget_detailedView.gif"/>        |
|                                              **Moving Patterns**                                               |                                                   **Reference Lines**                                                   |
| <img src="https://raw.githubusercontent.com/ivelascog/TimeWidget/main/imgs/TimeWidget_multipleSelection.gif"/> | <img src="https://raw.githubusercontent.com/ivelascog/TimeWidget/main/imgs/TimeWidget_referencesLines.png" width="300"> |
## Try it!

You can test TimeWidget right now with your **own CSV data** (less than 200MB), using:

| Observable Notebook                                                                                                                                                   |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| <a href="https://observablehq.com/d/37b572175ef5af3a"><img src="https://raw.githubusercontent.com/ivelascog/TimeWidget/main/imgs/TimeWidget_dataObservable.gif"/></a> |


## Examples of functionalities.
- [Basic Example](https://observablehq.com/d/ff2f8dc4992114e2?collection=@ivelascog/timesearcherplus)
- [Moving Patterns, Predefined TimeBoxes, Invert Queries](https://observablehq.com/d/29228e86855505e2?collection=@ivelascog/timesearcherplus)
- [References Curves](https://observablehq.com/d/249a32b214a2684d?collection=@ivelascog/timesearcherplus)
- [Make custom layouts](https://observablehq.com/@ivelascog/timewidget-make-a-custom-layout?collection=@ivelascog/timesearcherplus)
- [Maintaining the state](https://observablehq.com/d/9f28a6538b332cd3?collection=@ivelascog/timesearcherplus)
- [Aggregation and Selection modes](https://observablehq.com/d/e7e7b8a69f571200?collection=@ivelascog/timesearcherplus)
- [Custom Scales](https://observablehq.com/d/e7e7b8a69f571200?collection=@ivelascog/timesearcherplus)

## Real World Examples. 
 - [Tweets](https://observablehq.com/@john-guerra/timesearcher-tweets-example)
 - [Global Temperatures by Country](https://observablehq.com/@john-guerra/global-temperatures-by-country)
 - [Unemployment](https://observablehq.com/@john-guerra/timesearcher-example)
 - [Rent prices in Spain](https://observablehq.com/d/12800330b7979627)
 - [Pollution of Madrid](https://observablehq.com/d/f55385d1ad171003)

## Install

```
npm install time-widget
```
Requires [^popper.js@2.11.6](https://github.com/FezVrasta/popper.js/), [^d3@7.8.2](http://d3js.org) and [^htl@0.3.1](https://github.com/observablehq/htl).

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
</head>
<body>
<!-- target for the main Widget -->
<h1>Stock Prices</h1>
<div id="target"></div>

<!-- Load the libraries -->
<!-- <script src="../dist/TimeWidget.js"></script> -->
<script src="https://d3js.org/d3.v7.js"></script>
<script src="https://unpkg.com/time-widget/dist/TimeWidget.min.js"></script>

<script>
    let data = [
        { Date: new Date("01/01/2023"), Open: 250, id: "Apple", group: "Technology" },
        { Date: new Date("01/02/2023"), Open: 240, id: "Apple", group: "Technology" },
        { Date: new Date("01/03/2023"), Open: 260, id: "Apple", group: "Technology" },
    ];

    let ts = TimeWidget(
            data,
            {
                x: "Date", // Attribute to show in the X axis (Note that it also supports functions)
                y: "Open", // Attribute to show in the Y axis (Note that it also supports functions)
                id: "stock", // Attribute to group the input data (Note that it also supports functions)
            }
    );

    ts.addEventListener("input", () => {
        console.log("Selected", ts.value);
    });

    document.getElementById("target").appendChild(ts);
</script>
</body>
</html>
```
### Step by step

1. **HTML**. Start with this template
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>
  <!-- Your overview widget goes here -->
  <div id="target"></div>
  <!-- tYour detailed widget goes here -->
  <div id="targetDetailed"></div>
</body>
</html>
```
2. **Import TimeWidget**. Create and import a new JavaScript file below the scripts (d3,  and TimeWidget)
or right in the html like in the example below.
```html
<script src="https://d3js.org/d3.v7.js"></script>
<script src="https://unpkg.com/time-widget/dist/TimeWidget.min.js"></script>
<script type="text/javascript">
  //   YOUR_JS_CODE_HERE
</script>
```
3. **Create a TimeWidget Instance**
```js

  let data = [
    { Date: "01/01/2023", Open: 250, id: "Apple", group: "Technology" },
    { Date: "01/02/2023", Open: 240, id: "Apple", group: "Technology" },
    { Date: "01/03/2023", Open: 260, id: "Apple", group: "Technology" },
  ];

   let target = TimeWidget(data, {        
      x: "Date", // Atribute to show in the X axis (Note that it also supports functions)
      y:  "Open", // Atribute to show in the Y axis (Note that it also supports functions)
      id: "stock", // Atribute to group the input data (Note that it also supports functions)
      color: "Group", // (Optional) Attribute to color by
   });

  target.addEventListener("input", () => {console.log("Selected", target.value.selectedIds)})
```
4. [Optional] **Configure TimeWidget render**

You have two options:  add them at initialization:

```js
   let target = TimeWidget(data, {
    x: "Date", // Atribute to show in the X axis (Note that it also supports functions)
    y:  "Open", // Atribute to show in the Y axis (Note that it also supports functions)
    id: "stock", // Atribute to group the input data (Note that it also supports functions)
    color: "Group", // (Optional) Attribute to color by
    
    xPartitions: 10, // Partitions performed on the X-axis for the collision acceleration algorithm.
    yPartitions: 10, // Partitions performed on the Y-axis for the collision acceleration algorithm.
    defaultAlpha: 0.8, // Default transparency (when no selection is active) of drawn lines
    selectedAlpha: 1, // Transparency of selected lines
    noSelectedAlpha: 0.4, // Transparency of unselected lines
    backgroundColor: "#ffffff"
});
```
Or as a subsequent step after initialization
```js
   // Default Parameters
   target.ts.xPartitions = 10; // Partitions performed on the X-axis for the collision acceleration algorithm.
   target.ts.yPartitions = 10; // Partitions performed on the Y-axis for the collision acceleration algorithm.
   target.ts.defaultAlpha = 0.8; // Default transparency (when no selection is active) of drawn lines
   target.ts.selectedAlpha = 1; // Transparency of selected lines
   target.ts.noSelectedAlpha = 0.4; // Transparency of unselected lines
   target.ts.backgroundColor = "#ffffff";
```
5. **[Optional] Add the references lines
```js
    target.ts.addReferenceCurves(myReferenceCurves)
 ```
For the definition of the reference lines, see the [custom formats](#reference-lines) section.


## Options
This section will show all possible options grouped by categories.
### Elements
 -  **target**: pass a html element where you want to render
 -  **showBrushesControls**:If true, the brush control is displayed in the default location. If false you can still use brushesControlsElement to show the control on a different element on your app. For this use the exported value "groups"
 -  **showBrushTooltip**: Allows to display a tooltip on the brushes containing its coordinates.
 -  **showBrushesCoordinates**: If false you can still use brushesCoordinatesElement to show the control on a different element on your app. For this use the exported value "brushesCoordinates"
 -  **showDataGroups**: If false you can still use dataGroupElement to show the control on a different element on your app. For this use the exported value "dataGroups"
 -  **showDetails**: If false and with hasDetails = true, you can still use detailsElement to show the control on a different element on your app. For this use the exported value "details"
### Data
 - **x**:  Attribute to show in the X axis (Note that it also supports functions)
 - **y**:  Attribute to show in the Y axis (Note that it also supports functions)
 - **id**: Attribute to group the input data (Note that it also supports functions)
 - **color**: Specifies the attribute to be used to discriminate the groups (Note that it also supports functions).
 - **xScale**: It allows to pass a scale of d3 with its parameters, except for the domain which is defined by the xDomain parameter.
 - **yScale**: It allows to pass a scale of d3 with its parameters, except for the domain which is defined by the yDomain parameter.
 - **xDomain**: Defines the domain to be used in the x scale.
 - **yDomain**: Defines the domain to be used in the y scale.
 - **referenceCurves**:  Specifies a Json object with the information of the reference lines.
 - **fmtX**: Function, how to format x points in the tooltip. Note that it must conform to the data type provided in X.
 - **fmtY**: Function, how to format x points in the tooltip. Note that it must conform to the data type provided in Y.
 - **xLabel**: Label to show in the X axis
 - **yLabel**: Label to show in the Y axis
 - **xTicks**: Allows to use custom strings as ticks on the X-axis independently of the X-scale. A vector of [xValue,Label] pairs is expected. Note that only the defined elements are displayed and xValue must belong to the domain of X.
 - **yTicks**: Allows to use custom strings as ticks on the y-axis independently of the y-scale. A vector of [yValue,Label] pairs is expected. Note that only the defined elements are displayed and yValue must belong to the domain of X.
 - **filters**: Array of predefined TimeGroups and TimeBoxes. [Example](https://observablehq.com/d/29228e86855505e2?collection=@ivelascog/timesearcherplus)
### Color Configuration
 - **defaultAlpha**: Default transparency (when no selection is active) of drawn lines
 - **selectedAlpha**: Transparency of selected lines
 - **noSelectedAlpha**: Transparency of unselected lines
 - **alphaScale**: A scale to adjust the alpha by the number of rendering elements
 - **backgroundColor**: 
 - **defaultColor**: Default color (when no selection is active) of the drawn lines. It only has effect when "color" is not defined.
 - **selectedColor**: Color of selected lines. It only has effect when "color" is not defined.
 - **noSelectedColor**: Color of unselected lines. It only has effect when "color" is not defined.
 - **colorScale**: The color scale to be used to display the different groups defined by the "color" attribute. Typically, a [categorical scale of D3](https://observablehq.com/@d3/color-schemes)
 - **brushesColorScale**: The color scale to be used to display the brushes typically a [categorical scale of D3](https://observablehq.com/@d3/color-schemes)
 - **selectedColorTransform**: Function to be applied to the color of the selected group. It only has effect when "color" is defined.
### size Configuration
 - **width**: Set the desired width of the overview Widget
 - **height**: Set the desired height of the overview Widget
 - **detailsContainerHeight**: Set the desired height of the details container Widget
 - **detailsWidth**: Set the desired width of the individual details visualization
 - **detailsHeight**: Set the desired height of the individual details visualization
 - **margin**: Set the desired margin for overview Widget, d3 common format ( ```{ left: 50, top: 30, bottom: 50, right: 20 }```)
 - **detailsMargin**:  Margin options for details view, d3 common format, leave null for using the overview margin
### CallBacks
 - **updateCallback**: (data) => doSomethingWithData
 - **statusCallback**: (status) => doSomethingWithStatus
### Rendering
 - **brushShadow**: Determines how the shadow will be applied to the TimeBoxes belonging to the active TimeGroup.
 - **showGroupMedian**: If active show a line with the median of the enabled groups.
 - **hasDetails**: Determines whether detail data will be displayed or not. Disabling it saves preprocessing time if detail data is not to be displayed.
 - **doubleYlegend**: Allows the y-axis legend to be displayed on both sides of the chart.
 - **showGrid**: If active, a reference grid is displayed.
 - **brushGroupSize**: Controls the size of the colored rectangles used to select the different brushGroups.
### Performance
 - **maxDetailsRecords**: How many results to show in the detail view
 - **maxTimelines**: Set to a value to limit the number of distinct timelines to show
 - **xPartitions**: Partitions performed on the X-axis for the collision acceleration algorithm.
 - **yPartitions**: Partitions performed on the Y-axis for the collision acceleration algorithm.
### Options
 - **medianNumBins**: Number of bins used to compute the group median.
 - **medianLineDash**: Selected group median line dash pattern canvas style
 - **medianLineAlpha**: Selected group median line opacity
 - **medianLineWidth**: Selected group median line width
 - **medianFn**: Function to use when showing the median
 - **medianMinRecordsPerBin**: Min number of records each bin must have to be considered
 - **autoUpdate**: Allows to decide whether changes in brushes are processed while moving, or only at the end of the movement.
 - **_this**: pass the object this in order to be able to maintain the state in case of changes in the input
 - **fixAxis**: When active, the axes will not change when modifying the data.

## Custom Formats
This section details the different formats used by the application for some parameters. Note that the fields marked as optional are not mandatory and if not provided a default value will be used.

### Reference lines
```js
[
  {
    "name": "Line1",
    "color": "yellow", // Color in css format
    "opacity": 1, // opacity level of the line
    "data": [[p1x,p1y],[p2x,p2y],...]
  },
  {
    "name": "Line2",
    "color": "red", // Color in css format
    "opacity": 0.5, // opacity level of the line
    "data": [[p1x,p1y],[p2x,p2y],...]
  }
]  
 ```

### Filters
```js
filters: [
    {
        name: "Group 1",
        IsEnable: true, /*Optional*/
        isActive: false, /*Optional*/
        brushes: [
            {
                selectionDomain: [
                  [1.5,-7], /*[x0,y0]*/
                  [2.5, -17] /*[x1,y1]*/  
                ],
                mode: "intersect", /* or "contains". Optional*/
                aggregation: "and", /* or "or". Optional */
            }
        ]
    },
    {
        Another BrushGroup
    }
]
```



## License

TimeWidget.js is licensed under the MIT license. (http://opensource.org/licenses/MIT)

## Contributors

These research tools are the result of a collaboration between  Universidad Rey Juan Carlos in Madrid (Iván Velasco, Sofía Bayona and Luis Pastor), The Kangaroo Foundation in Colombia (Nathalie Charpak, José Tiberio Hernández), and Norhteastern University in Silicon Valley (John Alexis Guerra) 



