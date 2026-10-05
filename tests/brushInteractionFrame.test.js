import { readFileSync } from "node:fs";
import vm from "node:vm";
import { jest } from "@jest/globals";

// Exercise the production frame queue without requiring an SVG DOM.
const source = readFileSync(new URL("../src/BrushInteraction.js", import.meta.url), "utf8");
const scheduler = source.slice(
  source.indexOf("  function scheduleInteractionFrame()"),
  source.indexOf("  // Update brush intersections when moved")
);
const updateSelection = source.slice(
  source.indexOf("  function updateSelection("),
  source.indexOf("  function moveBrush(")
);
const brushed = source.slice(
  source.indexOf("  function brushed("),
  source.indexOf("  function brushFilter(")
);

function createInteraction(selectedIds = []) {
  const brushes = new Map([0, 1, 2].map((id) => [id, {
    isSelected: selectedIds.includes(id),
    selection: [[0, 0], [10, 10]],
  }]));
  const frames = new Map();
  let frameId = 0;
  const context = vm.createContext({
    window: {
      requestAnimationFrame: jest.fn((callback) => {
        frames.set(++frameId, callback);
        return frameId;
      }),
      cancelAnimationFrame: (id) => frames.delete(id),
    },
    brushesGroup: new Map([[0, { brushes }]]),
    PERFORMANCELOG: false,
    updateBrush: jest.fn(() => true),
    brushFilter: jest.fn(),
    snapSelectionPixels: (selection) => selection,
    getSelectionDomain: (selection) => selection,
  });
  vm.runInContext(`
    let interactionFrame = null;
    let pendingBrushUpdate = null;
    let pendingSelectionUpdate = false;
    ${scheduler}
    ${updateSelection}
    ${brushed}
  `, context);
  context.brushed = jest.fn(context.brushed);
  return {
    context,
    brushes,
    move(id, selection) {
      const brush = [id, brushes.get(id)];
      brush[1].selection = selection;
      context.scheduleSelectionUpdate();
      context.scheduleBrushUpdate({ selection, sourceEvent: {} }, brush);
    },
    paint() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

test("updates an individually dragged TimeBox before release", () => {
  const interaction = createInteraction();
  interaction.move(0, [[20, 0], [30, 10]]);
  expect(interaction.context.brushFilter).not.toHaveBeenCalled();
  interaction.paint();
  expect(interaction.context.updateBrush).toHaveBeenCalledWith([0, interaction.brushes.get(0)]);
  expect(interaction.context.brushFilter).toHaveBeenCalledTimes(1);
});

test("updates the trigger and all Shift-selected TimeBoxes in the same frame", () => {
  const interaction = createInteraction([1, 2]);
  interaction.move(0, [[20, 0], [30, 10]]);
  interaction.paint();
  expect(interaction.context.updateBrush.mock.calls.map(([brush]) => brush[0])).toEqual([1, 2, 0]);
  expect(interaction.context.brushFilter).toHaveBeenCalledTimes(2);
});

test("coalesces pointer movements and uses the latest position", () => {
  const interaction = createInteraction([0, 1]);
  interaction.move(0, [[20, 0], [30, 10]]);
  interaction.move(0, [[40, 0], [50, 10]]);
  interaction.paint();
  expect(interaction.context.window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  expect(interaction.context.updateBrush.mock.calls[0][0][1].selection).toEqual([[40, 0], [50, 10]]);
  expect(interaction.context.updateBrush).toHaveBeenCalledTimes(2);
  expect(interaction.context.brushFilter).toHaveBeenCalledTimes(1);
});

test("release flushes the final position without leaving a queued update", () => {
  const interaction = createInteraction();
  const selection = [[40, 0], [50, 10]];
  interaction.move(0, selection);
  const event = { selection, sourceEvent: {} };
  const brush = [0, interaction.brushes.get(0)];
  interaction.context.flushBrushUpdate(event, brush);
  interaction.paint();
  expect(interaction.context.brushed).toHaveBeenCalledWith(event, brush);
  expect(interaction.context.brushed).toHaveBeenCalledTimes(1);
  expect(interaction.context.updateBrush).toHaveBeenCalledTimes(1);
});
