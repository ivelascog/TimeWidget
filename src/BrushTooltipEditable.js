import * as htl from "htl";

const autoCloseTime = 500; // ms

function BrushTooltipEditable({
  fmtX,
  fmtY,
  target,
  margin = { top: 0, left: 0 },
  bounds,
  callback = () => {},
}) {
  const x0E = htl.html`<input class="x0" contenteditable="true">`;
  const y0E = htl.html`<input class="y0" contenteditable="true">`;
  const x1E = htl.html`<input class="x1" contenteditable="true">`;
  const y1E = htl.html`<input class="y1" contenteditable="true">`;

  // https://stackoverflow.com/questions/3392493/adjust-width-of-input-field-to-its-input
  const adjustInputWidth = (input) => {
    input.addEventListener("input", resizeInput); // bind the "resizeInput" callback on "input" event
    resizeInput.call(input); // immediately call the function

    function resizeInput() {
      this.style.width = this.value.length + 1 + "ch";
    }
  };

  const resizeInputs = () => [x0E, y0E, x1E, y1E].map(adjustInputWidth);

  const btnChange0E = htl.html`<button>✅</button>`;
  const btnChange1E = htl.html`<button>✅</button>`;

  const fromE = htl.html`<div style="position: absolute; top:0; left:0;">
    <div style="display:flex; position: absolute; bottom: 0; right: 0;">
      ${x0E}<strong> x </strong>${y0E} ${btnChange0E}
    </div>
  </div>`;
  const toE = htl.html`<div style="position: absolute; display:flex;">${x1E}<strong> x </strong>${y1E} ${btnChange1E}</div>`;

  const brushTooltip = htl.html`<div class="__ts_tooltip" style="display: none; z-index:2; position: absolute; top: ${margin.top}px; left: ${margin.left}px;">
    <style>
    div.__ts_tooltip { 
      font-family: sans-serif; font-size: 10pt; 
    }
    div.__ts_tooltip > div > div * { 
      margin-right: 1px;
    }
    div.__ts_tooltip div > button {
      padding: 0;
      display: none;
    }
    div.__ts_tooltip div:hover > button {
      padding: 0;
      display: block;
    }
    div.__ts_tooltip input {
      background-color:rgba(255, 255, 255, 0);    
      border: none;
      outline: none;
    }
    div.__ts_tooltip input:focus {
        border: solid #aaa;
    }


    </style>
    <div>${fromE}</div>
    <div>${toE}</div>

  </div>`;

  // x0E.oninput = (evt) => evt.preventDefault();
  // x1E.oninput = (evt) => evt.preventDefault();
  // y0E.oninput = (evt) => evt.preventDefault();
  // y1E.oninput = (evt) => evt.preventDefault();

  brushTooltip.__update = ({ selection, selectionPixels }) => {
    brushTooltip.__cancelAutoHide();
    brushTooltip.style.display = "block";
    x0E.value = fmtX(selection[0][0]);
    x1E.value = fmtX(selection[1][0]);
    y0E.value = fmtY(selection[0][1]);
    y1E.value = fmtY(selection[1][1]);

    resizeInputs();

    const tooltipBounds = bounds || [
      [0, 0],
      [
        Math.max(0, target.clientWidth - margin.left),
        Math.max(0, target.clientHeight - margin.top),
      ],
    ];
    const fromContent = fromE.firstElementChild;
    const fromRect = fromContent.getBoundingClientRect();
    const toRect = toE.getBoundingClientRect();
    const [fromLeft, fromTop] = clampTooltipPosition(
      selectionPixels[0],
      [fromRect.width, fromRect.height],
      tooltipBounds,
      { alignX: "end", alignY: "end" }
    );
    const [toLeft, toTop] = clampTooltipPosition(
      selectionPixels[1],
      [toRect.width, toRect.height],
      tooltipBounds
    );

    // fromContent is anchored by its bottom-right corner inside fromE.
    fromE.style.left = fromLeft + fromRect.width + "px";
    fromE.style.top = fromTop + fromRect.height + "px";
    toE.style.left = toLeft + "px";
    toE.style.top = toTop + "px";
  };

  let autoHideTimeout = null;
  brushTooltip.__cancelAutoHide = () => {
    if (autoHideTimeout !== null) {
      clearTimeout(autoHideTimeout);
      autoHideTimeout = null;
    }
  };
  brushTooltip.__scheduleAutoHide = () => {
    brushTooltip.__cancelAutoHide();
    // A short delay lets the pointer move from the TimeBox into the tooltip
    // so its coordinate fields remain usable.
    autoHideTimeout = setTimeout(() => {
      autoHideTimeout = null;
      if (!brushTooltip.contains(document.activeElement)) brushTooltip.__hide();
    }, autoCloseTime);
  };
  brushTooltip.__hide = () => {
    brushTooltip.__cancelAutoHide();
    brushTooltip.style.display = "none";
  };

  brushTooltip.addEventListener("pointerenter", () => {
    brushTooltip.__cancelAutoHide();
  });
  brushTooltip.addEventListener("pointerleave", () => {
    brushTooltip.__scheduleAutoHide();
  });
  brushTooltip.addEventListener("focusout", () => {
    setTimeout(() => {
      if (
        !brushTooltip.matches(":hover") &&
        !brushTooltip.contains(document.activeElement)
      ) {
        brushTooltip.__scheduleAutoHide();
      }
    });
  });

  // brushTooltip.oninput = (evt) => evt.preventDefault();

  function triggerUpdate() {
    brushTooltip.value = [
      [x0E.value, y0E.value],
      [x1E.value, y1E.value],
    ];
    brushTooltip.dispatchEvent(new Event("input", { bubbles: true }));

    callback(brushTooltip.value);
  }

  btnChange0E.addEventListener("click", triggerUpdate);
  btnChange1E.addEventListener("click", triggerUpdate);
  brushTooltip.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.matches("input")) return;
    event.preventDefault();
    triggerUpdate();
  });

  let tooltipNode = target.getElementsByClassName("__ts_tooltip");
  if (tooltipNode.length > 0) target.removeChild(tooltipNode[0]);
  target.appendChild(brushTooltip);

  //triggerUpdate();
  resizeInputs();

  return brushTooltip;
}

export function clampTooltipPosition(
  [anchorX, anchorY],
  [tooltipWidth, tooltipHeight],
  [[minX, minY], [maxX, maxY]],
  { alignX = "start", alignY = "start" } = {}
) {
  const preferredLeft = alignX === "end" ? anchorX - tooltipWidth : anchorX;
  const preferredTop = alignY === "end" ? anchorY - tooltipHeight : anchorY;
  const latestLeft = Math.max(minX, maxX - tooltipWidth);
  const latestTop = Math.max(minY, maxY - tooltipHeight);

  return [
    Math.min(Math.max(preferredLeft, minX), latestLeft),
    Math.min(Math.max(preferredTop, minY), latestTop),
  ];
}

export default BrushTooltipEditable;
