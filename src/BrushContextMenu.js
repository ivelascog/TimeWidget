import * as htl from "htl";
import {BrushAggregation, BrushModes, log} from "./utils.js";

function BrushContextMenu({ target, callback }) {
  const intersectE = htl.html`<input type="radio" name="mode" id="__ts_c_intersect" value="intersect">`;
  const containsE = htl.html`<input type="radio" name="mode" id="__ts_c_contains" value="contains">`;
  const notE = htl.html`<input type="checkbox"  id="__ts_c_not">`;
  const andE = htl.html`<input type="radio" name="aggregation" id="__ts_c_and" value="and">`;
  const orE = htl.html`<input type="radio" name="aggregation" id="__ts_c_or" value="or">`;
  const closeBtn = htl.html`<button style="position: absolute; right: 0; top: 0; margin: 0; border: none; background: none; cursor: pointer; font-size: 0.8rem; color: #444; line-height: 1; padding: 2px 2px;">&times;</button>`;

  intersectE.onchange = onChange;
  containsE.onchange = onChange;
  andE.onchange = onChange;
  orE.onchange = onChange;
  notE.onchange = onChange;

  let _brush;

  let contextMenu = htl.html`<div class="__ts_contextMenu" style="display: none; z-index: 2; position: absolute" >
        ${closeBtn}
      
        <div class="__ts_option_label"><strong>Mode</strong></div>
        <div class="__ts_option_values">
          <div>
            ${intersectE}
            <label for="__ts_c_intersect" title="Search for timelines that touch any part of the timebox">Intersect</label>
          </div>
          <div>
            ${containsE}
            <label for="__ts_c_contains" title="Search for timelines that are fully contained in the timebox">Contains</label>
          </div>
          <div>
            ${notE}
            <label for="__ts_c_not" title=" ">Not</label>
          </div>
        </div>
      

      
        <div class="__ts_option_label"><strong>Aggregation</strong></div>
        <div class="__ts_option_values">
          <div>
            ${andE}
            <label for="__ts_c_and">And</label>
          </div>
          <div>
            ${orE}
            <label for="__ts_c_or">Or</label>
          </div>
        </div>
      
      

      <style> 
        .__ts_contextMenu { 
            border-radius: 3px;
            padding: 4px 14px 4px 4px;
            position: absolute; 
            width: max-content;
            background: #f6f6f6;
            opacity: 0.9;
            border: 1px solid #ccc; 
            font-family: sans-serif;
            font-size: 0.8rem;
            grid-template-columns: 1fr auto;
            grid-row-gap: 7px;
            box-shadow: 2px 2px 1px 0px #888888;
        }         

        .__ts_contextMenu  .__ts_option_values:hover { 
            background: #eee; 
        } 

        .__ts_contextMenu input[type="radio"] {
          margin-top: -1px;
          vertical-align: middle;
        }
      </style> 
    </div>`;

  let contextNode = target.getElementsByClassName("__ts_contextMenu");
  if (contextNode.length > 0) target.removeChild(contextNode[0]);
  target.appendChild(contextMenu);

  // To keep track of the hiding timeout
  let toHide = null;
  // If the mouse leaves the context menu, hide it after 1s
  contextMenu.onmouseleave = () =>
    (toHide = setTimeout(() => {
      contextMenu.__hide();
      toHide = null;
    }, 1000));
  // But if the mouse re-enters the context menu, cancel the hiding
  contextMenu.onmouseenter = () => {
    toHide && clearTimeout(toHide);
    toHide = null;
  };
  closeBtn.onclick = () => contextMenu.__hide();

  function onChange() {
    let brushMode = intersectE.checked
      ? BrushModes.Intersect
      : BrushModes.Contains;
    let brushAggregation = andE.checked
      ? BrushAggregation.And
      : BrushAggregation.Or;
    let brushNot = notE.checked;
    callback(brushMode, brushAggregation, brushNot, _brush);
  }

  contextMenu.__hide = () => (contextMenu.style.display = "none");
  contextMenu.__show = (mode, aggregation,not, pxX, pxY, brush) => {
    _brush = brush;
    switch (mode) {
      case BrushModes.Intersect:
        intersectE.checked = true;
        break;
      case BrushModes.Contains:
        containsE.checked = true;
        break;
      default:
        intersectE.checked = true;
        log(
          "🚫 ERROR The method elected to compute the selection are not support"
        );
    }

    notE.checked = not;

    switch (aggregation) {
      case BrushAggregation.And:
        andE.checked = true;
        break;
      case BrushAggregation.Or:
        orE.checked = true;
        break;
      default:
        andE.checked = true;
        log("🚫 ERROR The aggregation method elected are not support");
    }

    contextMenu.style.display = "grid";
    contextMenu.style.left = pxX + "px";
    contextMenu.style.top = pxY + "px";
  };

  return contextMenu;
}

export default BrushContextMenu;
