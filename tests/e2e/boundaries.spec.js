import {
  test,
  expect,
  open,
  mount,
  group,
  filter,
  domains,
  selections,
  coordinates,
  selectFirst,
  key,
  draw,
} from "./helpers.js";

test.beforeEach(async ({ page }) => open(page));

for (const [arrow, box, corner, axis, limit] of [
  [
    "ArrowRight",
    [
      [7, 60],
      [9, 40],
    ],
    1,
    0,
    10,
  ],
  [
    "ArrowLeft",
    [
      [1, 60],
      [3, 40],
    ],
    0,
    0,
    0,
  ],
  [
    "ArrowUp",
    [
      [2, 75],
      [8, 55],
    ],
    0,
    1,
    80,
  ],
  [
    "ArrowDown",
    [
      [2, 45],
      [8, 25],
    ],
    1,
    1,
    20,
  ],
]) {
  test(`${arrow} stops at the domain boundary without changing box size`, async ({
    page,
  }) => {
    await mount(page, { filters: [group([filter(box)])] });
    await selectFirst(page);
    for (let i = 0; i < 4; i++) await key(page, arrow);
    const [d] = await domains(page);
    expect(d[corner][axis]).toBeCloseTo(limit, 5);
    expect(d[1][0] - d[0][0]).toBeCloseTo(box[1][0] - box[0][0], 5);
    expect(d[0][1] - d[1][1]).toBeCloseTo(box[0][1] - box[1][1], 5);
  });
}

for (const [handleName, dx, dy, corner, axis] of [
  ["w", 35, 0, 0, 0],
  ["e", -35, 0, 1, 0],
  ["n", 0, 20, 0, 1],
  ["s", 0, -20, 1, 1],
]) {
  test(`resize through the ${handleName} handle changes the corresponding domain edge`, async ({
    page,
  }) => {
    await mount(page, { filters: [group()] });
    const before = await domains(page);
    const handle = page
      .locator(`.brush:has(rect.selection[width]) .handle--${handleName}`)
      .first();
    const b = await handle.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, {
      steps: 8,
    });
    await page.mouse.up();
    const after = await domains(page);
    expect(after[0][corner][axis]).not.toBeCloseTo(before[0][corner][axis], 3);
    expect(after[0][1 - corner][axis]).toBeCloseTo(
      before[0][1 - corner][axis],
      5
    );
  });
}

test("a click without dragging does not create a query", async ({ page }) => {
  await mount(page);
  await page
    .locator(".brush .overlay")
    .last()
    .click({ position: { x: 100, y: 100 } });
  await expect(selections(page)).toHaveCount(0);
  expect(await domains(page)).toEqual([]);
});

test("date snapping rounds drawn coordinates to whole days", async ({
  page,
}) => {
  await mount(page, { snapX: { days: 1 }, snapY: 10 }, { dates: true });
  await draw(page, [
    [+new Date(2023, 0, 3, 4), 63],
    [+new Date(2023, 0, 8, 20), 37],
  ]);
  const [d] = await domains(page);
  expect(d.map((p) => p[0])).toEqual([
    new Date(2023, 0, 3),
    new Date(2023, 0, 9),
  ]);
  expect(d.map((p) => p[1])).toEqual([60, 40]);
});

test("invalid date input leaves the committed brush unchanged", async ({
  page,
}) => {
  await mount(page, {}, { dates: true });
  await draw(page, [
    [+new Date(2023, 0, 3), 60],
    [+new Date(2023, 0, 9), 40],
  ]);
  const before = await domains(page);
  await coordinates(page).nth(0).fill("");
  await coordinates(page).nth(0).press("Tab");
  expect(await domains(page)).toEqual(before);
});

test("crossing the numeric X bounds advances the opposite edge by stepX", async ({
  page,
}) => {
  await mount(page, { filters: [group()] });
  await selectFirst(page);
  await coordinates(page).nth(0).fill("8");
  await coordinates(page).nth(0).press("Tab");
  const [d] = await domains(page);
  expect(d[0][0]).toBeCloseTo(8, 5);
  expect(d[1][0]).toBeCloseTo(9, 5);
});

test("crossing the numeric Y bounds advances the opposite edge by stepY", async ({
  page,
}) => {
  await mount(page, { filters: [group()] });
  await selectFirst(page);
  await coordinates(page).nth(2).fill("60");
  await coordinates(page).nth(2).press("Tab");
  const [d] = await domains(page);
  expect(d[0][1]).toBeCloseTo(65, 5);
  expect(d[1][1]).toBeCloseTo(60, 5);
});

test("keyboard commands with no active TimeBox leave the query unchanged", async ({
  page,
}) => {
  await mount(page);
  for (const value of [
    "ArrowRight",
    "ArrowLeft",
    "ArrowUp",
    "ArrowDown",
    "Delete",
  ])
    await key(page, value);
  expect(await domains(page)).toEqual([]);
  await expect(selections(page)).toHaveCount(0);
});
