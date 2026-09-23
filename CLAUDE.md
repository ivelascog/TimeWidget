# TimeWidget — agent guide

An interactive **TimeSearcher** visualization: many time series drawn on one
canvas, queried by dragging **TimeBoxes** (brushes) over regions of the plot.
Vanilla JS + d3 v7, no framework. Published to npm as `time-widget`; consumed
from a `<script>` tag, from Observable, or as an ESM import.

Maintained by Iván Velasco González ([@ivelascog](https://github.com/ivelascog),
repo owner) and John Alexis Guerra Gómez ([@john-guerra](https://github.com/john-guerra)).

---

## Build, test, run

```bash
npm ci
npm run build          # rollup -> dist/{TimeWidget.js,.esm.js,.min.js}
npm test               # jest unit tests (node env, native ESM)
npm run test:e2e       # playwright, real browser, drives dist/
npm run test:all       # unit -> build -> e2e, the full gate
```

To see it in a browser:

```bash
npx http-server . -p 8099 -c-1     # serve the REPO ROOT, not example/
open http://localhost:8099/example/stocks.html
```

Serve the repo root: the examples load `../dist/TimeWidget.js`, and the e2e
fixture also loads `../../node_modules/d3/dist/d3.js`. Only the root contains
both. `npm run dev` is `rollup -c -w` — a watch build, **not** a server.

**`npm run build` before e2e.** The e2e suite drives `dist/`, not `src/`, so a
source edit is invisible to it until you rebuild. CI does this explicitly.

### Which example to open

| File | Good for |
|---|---|
| `example/stocks.html` | **default choice** — ~410 real series, brushes, medians, reference curves |
| `example/ResizeDomain.html` | `ts.setDomains()` zoom, driven by sliders |
| `example/canguro.html` | reference curves (growth charts) |
| `example/minimum.html` | smallest possible embed |

---

## Architecture

| File | Role |
|---|---|
| `src/TimeWidget.js` | the factory. Owns scales, layout, the `ts` API object, render orchestration. **~1500 lines — the file everything gets piled into; extract rather than append.** |
| `src/BrushInteraction.js` | TimeBoxes: creation, drag, groups, filter logic, selection state |
| `src/TimeLineOverview.js` | canvas rendering of the series + group medians |
| `src/BVH.js` | bounding-volume hierarchy for hit-testing at scale |
| `src/utils.js` | framework-free helpers — **the testable seam; put pure logic here** |

`TimeWidget(data, opts)` returns a **DOM element** with the internal API hung
off it as `element.ts`, plus `element.value`, `.brushGroups`, `.extent`. So
`ts.ts.setDomains(...)` in example code is not a typo.

Two names for one thing: `ts` (internal API object) vs the returned element.
`let ts = {}` at the top of the factory is a **plain object**, not the element —
assigning `ts.foo` does not put `foo` on the DOM node.

---

## Traps that will cost you an afternoon

**The build parses with an ancient acorn, before Babel.**
`rollup-plugin-ascii` bundles its own acorn that predates ES2018. `??`, `?.`,
and object spread all fail at *bundle* time with a bare `SyntaxError: Unexpected
token` — while `npm test` stays green, because jest never touches that parser.
Use `||`, explicit null checks, `Object.assign`, and `.slice()`. Always run
`npm run build` before believing a change works.

**d3 is an `external`, not bundled.** `dist/TimeWidget.js` expects a global
`d3`. Any host page must load d3 first.

**`selectionDomain` is `[[xLow, yHigh], [xHigh, yLow]]`.**
It comes from pixel corners `[[left, top], [right, bottom]]`, and `scaleY`'s
range is `[height, 0]`, so the **top** pixel inverts to the **high** data value.
The array order stays the same while the semantic order reverses. `isInsideDomain`
and `clampToDomain` both encode this; a new helper that assumes ascending y will
be subtly wrong. (`getSelectionDomain` / `getSelectionPixels` take **one**
argument each.)

**`rect.selection` matches d3's hidden pending brush too.** It has no
`width`/`height` attributes. Filter for the one with real dimensions or you will
measure the invisible one and conclude the brush is broken. (This cost an
afternoon.)

**d3 launders brush geometry.** `brush.move` normalises the extent and
`newBrush()` stores `selectionDomain: null`, re-deriving it from the rendered
pixels. So a wrong corner *order* coming out of `clampToDomain` is invisible in
the DOM, and d3's `brush.extent` already confines pixels to the plot area. Test
that contract at the **unit** level; an e2e assertion on the rendered rect will
pass either way. See the note in `tests/e2e/zoom.spec.js`.

**Zoom re-renders through `ts.update()`, never `ts.data()`.**
`ts.update()` calls `initDomains()` + `init()`. `ts.data()` is only for a new
dataset — that is why `fullExtent` can be recomputed there without a zoom
narrowing it.

**`clip-path="url(#id)"` resolves document-wide.** Unlike the repo's other DOM
ids (`#render`, `#brushes`), which are only ever used as selectors scoped to a
widget's own subtree, an SVG `url(#…)` reference is global. Two widgets on one
page sharing an id means the second is clipped by the first one's rect. Hence
`clipId = plotClip-${++instanceCounter}`, stable across re-renders.

**Reference curves must not be mutated.** Store sorted *copies*
(`storeReferenceCurves`). The original code filtered `c.data` down to the visible
domain in place, so zooming out could never restore the discarded points.

---

## Conventions

- **2-space indent, prettier + eslint.** `npm run build` does not lint, and
  neither does CI; run `npx eslint src/` yourself. Six pre-existing
  `no-unused-vars` errors are known (as of Aug 2026) — check whether a reported
  error is actually yours before chasing it.
- **Conventional commits** (`fix:`, `feat:`, `chore:`), and PRs are
  **squash-merged**, so `main` stays linear.
- **Squash-merging breaks ancestry.** `git branch --merged` will report a merged
  branch as unmerged and `-d` will refuse it. Check content instead —
  `git diff main <branch>` — before deleting, and use `-D`.
- **`dist/` is gitignored** but published to npm; never commit build output.
- Repo is `ivelascog/TimeWidget`; `origin` points there for both of us.

---

## Testing

A real pyramid — put each test at the tier that can actually observe the bug.

- **`tests/*.test.js`** — jest, node env, native ESM. Pure logic only. Note
  `jest` is **not a global**: `import { jest } from "@jest/globals"`.
- **`tests/e2e/*.spec.js`** — playwright against `dist/` via
  `tests/e2e/fixture.html`, which exposes `window.makeWidget/makeData`. Build
  widgets there rather than depending on `example/` pages, which change for demo
  reasons.

**Every bug fixed in #63 and #65 was a call-site or render bug, and the unit
suite was 19/19 green the whole time it was broken.** Pure-logic bug → unit
test; anything involving construction, rendering, the DOM, or two widgets
coexisting → e2e.

**Prove the test fails without the fix.** Revert the fix, watch it go red, then
restore. Two assertions written during the #65 review passed with the fix
reverted and had to be deleted — d3's normalisation made the thing they claimed
to check unobservable. A test that never failed proves nothing.

---

## Guardrails

- **Don't push to `main`.** Open a PR; ivelascog reviews. `dev` is a scratch
  integration branch and gets reset to `main` freely.
- **Don't force-push a shared branch** without saying so. Prefer merging `main`
  in over rebasing a branch someone else has commits on.
- **Don't delete branches on evidence of ancestry alone** — see the squash note
  above.
- **Don't bump the version or publish to npm** without being asked.
