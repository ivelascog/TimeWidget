import { cloneBrushGroupPayload } from "../src/BrushInteraction.js";

function fakeGroup() {
  const brushes = new Map();
  brushes.set(0, { mode: "Intersect", aggregation: "And", selection: [[0, 0], [10, 10]], selectionDomain: [[30, 1000], [40, 3000]] });
  brushes.set(1, { mode: "Intersect", aggregation: "And", selection: null, selectionDomain: null }); // pending brush
  return { name: "Group 1", isEnable: true, isActive: false, brushes };
}

test("copies only committed brushes with mode/aggregation/selectionDomain", () => {
  const payload = cloneBrushGroupPayload(fakeGroup());
  expect(payload.brushes).toEqual([
    { mode: "Intersect", aggregation: "And", selectionDomain: [[30, 1000], [40, 3000]] },
  ]);
});

test("appends a copy suffix to the name and is enabled, not active", () => {
  const payload = cloneBrushGroupPayload(fakeGroup());
  expect(payload.name).toBe("Group 1 (copy)");
  expect(payload.isEnable).toBe(true);
  expect(payload.isActive).toBe(false);
});

test("returns an empty brushes array for a group with no committed brushes", () => {
  const brushes = new Map();
  brushes.set(0, { mode: "Intersect", aggregation: "And", selection: null, selectionDomain: null });
  const payload = cloneBrushGroupPayload({ name: "Group 2", brushes });
  expect(payload.brushes).toEqual([]);
});

test("does not share the source Map reference", () => {
  const g = fakeGroup();
  const payload = cloneBrushGroupPayload(g);
  expect(Array.isArray(payload.brushes)).toBe(true);
});
