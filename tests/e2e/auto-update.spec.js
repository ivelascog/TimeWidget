import {
  test,
  expect,
  open,
  mount,
  group,
  filter,
  ids,
  selections,
  coordinates,
  domains,
  key,
} from "./helpers.js";

test.beforeEach(async ({ page }) => open(page));

test("autoUpdate=false updates a new TimeBox geometry before filtering on release", async ({
  page,
}) => {
  await mount(page, { autoUpdate: false });
  const plot = await page.locator(".brush .overlay").last().boundingBox();
  await page.mouse.move(plot.x + plot.width * 0.2, plot.y + plot.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(
    plot.x + plot.width * 0.8,
    plot.y + plot.height * 0.75,
    { steps: 10 }
  );
  await expect(coordinates(page).nth(1)).toHaveValue("8.0");
  const state = await page.evaluate(() => {
    const brush = [...window.widget.value.status.values()][0].brushes
      .values()
      .next().value;
    return {
      domain: brush.selectionDomain,
      intersections: brush.intersections,
      ids: window.widget.value.selectedIds,
    };
  });
  expect(state.domain[0][0]).toBeCloseTo(2, 5);
  expect(state.domain[1][0]).toBeCloseTo(8, 5);
  expect(state.domain[0][1]).toBeCloseTo(65, 5);
  expect(state.domain[1][1]).toBeCloseTo(35, 5);
  expect(state.intersections).toBeNull();
  expect(state.ids).toEqual([]);
  await page.mouse.up();
  await ids(page, ["mid"]);
  await expect(selections(page)).toHaveCount(1);
});

for (const autoUpdate of [true, false]) {
  test(`dragging multiple TimeBoxes preserves deltas with autoUpdate=${autoUpdate}`, async ({
    page,
  }) => {
    await mount(page, {
      autoUpdate,
      filters: [
        group([
          filter([
            [1, 60],
            [3, 40],
          ]),
          filter([
            [5, 60],
            [7, 40],
          ]),
        ]),
      ],
    });
    await selections(page)
      .first()
      .click({ modifiers: ["Shift"], position: { x: 20, y: 20 } });
    await selections(page)
      .nth(1)
      .click({ modifiers: ["Shift"], position: { x: 20, y: 20 } });
    await ids(page, ["mid"]);
    const before = await domains(page);
    await page.evaluate(() => {
      window.previousIntersections = [
        ...window.widget.brushGroups.values(),
      ][0].brushes.values();
      window.previousIntersections = [...window.previousIntersections].map(
        (b) => b.intersections
      );
    });
    const box = await selections(page).first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 35,
      box.y + box.height / 2 + 64,
      { steps: 8 }
    );
    const during = await domains(page);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        expect(during[i][j][0] - before[i][j][0]).toBeCloseTo(0.5, 5);
        expect(during[i][j][1] - before[i][j][1]).toBeCloseTo(-12, 5);
      }
    }
    if (!autoUpdate) {
      await ids(page, ["mid"]);
      expect(
        await page.evaluate(() =>
          [
            ...[...window.widget.brushGroups.values()][0].brushes.values(),
          ].every((b, i) => b.intersections === window.previousIntersections[i])
        )
      ).toBe(true);
    } else {
      await ids(page, []);
    }
    await page.mouse.up();
    await ids(page, []);
    expect(await domains(page)).toEqual(during);
  });
}

for (const autoUpdate of [true, false]) {
  for (const selectedEnd of [8, 10]) {
    for (const via of ["drag", "keyboard"]) {
      test(`an unselected active TimeBox moves independently via ${via} with autoUpdate=${autoUpdate}, selectedEnd=${selectedEnd}`, async ({
        page,
      }) => {
        await mount(page, {
          autoUpdate,
          filters: [
            group([
              filter([
                [selectedEnd - 2, 60],
                [selectedEnd, 40],
              ]),
              filter([
                [2, 60],
                [4, 40],
              ]),
            ]),
          ],
        });
        const brushIds = await page.evaluate(() => [
          ...[...window.widget.brushGroups.values()][0].brushes.keys(),
        ]);
        await page
          .locator(`#brush-${brushIds[0]} rect.selection[width]`)
          .click({ modifiers: ["Shift"], position: { x: 20, y: 20 } });
        await page
          .locator(`#brush-${brushIds[1]} rect.selection[width]`)
          .click({ position: { x: 20, y: 20 } });
        const before = await domains(page);
        if (via === "keyboard") {
          await key(page, "ArrowRight");
        } else {
          const box = await page
            .locator(`#brush-${brushIds[1]} rect.selection[width]`)
            .boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(
            box.x + box.width / 2 + 70,
            box.y + box.height / 2,
            { steps: 8 }
          );
          expect((await domains(page))[0]).toEqual(before[0]);
          await page.mouse.up();
        }
        const after = await domains(page);
        expect(after[0]).toEqual(before[0]);
        for (let corner = 0; corner < 2; corner++) {
          expect(after[1][corner][0] - before[1][corner][0]).toBeCloseTo(1, 5);
          expect(after[1][corner][1]).toBeCloseTo(before[1][corner][1], 5);
        }
      });
    }
  }
}
