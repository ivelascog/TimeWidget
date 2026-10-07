import { checkGate } from "../bench/env.mjs";
import { checkPreflight } from "../bench/env.mjs";
import { presentedResult } from "../bench/trace.mjs";
import { startServer } from "../bench/server.mjs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const good = {
  canvas2d: "enabled",
  gpuCompositing: "enabled",
  visible: true,
  focused: true,
  crossOriginIsolated: true,
};

describe("checkGate", () => {
  test("passes a healthy environment", () => {
    expect(checkGate(good, {})).toEqual({ ok: true, reasons: [] });
  });
  test("rejects software canvas unless allowed", () => {
    const sw = { ...good, canvas2d: "unavailable_software", gpuCompositing: "disabled_software" };
    expect(checkGate(sw, {}).ok).toBe(false);
    expect(checkGate(sw, { allowSoftwareRaster: true }).ok).toBe(true);
  });
  test("rejects hidden or unfocused pages", () => {
    expect(checkGate({ ...good, visible: false }, {}).reasons).toContain("page not visible");
    expect(checkGate({ ...good, focused: false }, {}).reasons).toContain("page not focused");
  });
  test("rejects coarse timers", () => {
    expect(checkGate({ ...good, crossOriginIsolated: false }, {}).ok).toBe(false);
  });
});

describe("startServer", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let server;
  beforeAll(async () => {
    server = await startServer(root);
  });
  afterAll(() => server.close());

  const get = (p, headers = {}) =>
    new Promise((resolve, reject) => {
      // Raw path, so "../" reaches the server instead of being normalised.
      const req = http.request(server.url + "/", { path: p, headers }, (res) => {
        res.resume();
        resolve(res);
      });
      req.on("error", reject);
      req.end();
    });

  test("binds to 127.0.0.1", () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
  test("serves files with cross-origin isolation headers", async () => {
    const res = await get("/bench/page.html");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers["cross-origin-embedder-policy"]).toBe("require-corp");
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });
  // DNS rebinding: a page on evil.example re-pointed at 127.0.0.1 sends its
  // own hostname in Host. Without this check it could read the repository
  // (including .git) for as long as a multi-hour benchmark runs.
  test("rejects requests whose Host is not the server's own address", async () => {
    const res = await get("/bench/page.html", { Host: "evil.example:" + new URL(server.url).port });
    expect(res.statusCode).toBe(403);
  });
  test("serves only the directories the harness needs", async () => {
    expect((await get("/dist/TimeWidget.js")).statusCode).toBe(200);
    expect((await get("/node_modules/d3/package.json")).statusCode).toBe(200);
    expect((await get("/.git/HEAD")).statusCode).toBe(404);
    expect((await get("/package.json")).statusCode).toBe(404);
    expect((await get("/rendimiento_TimeWidget.xlsx")).statusCode).toBe(404);
  });
  test("does not list directories or escape the root", async () => {
    expect((await get("/bench/")).statusCode).toBe(404);
    expect((await get("/../../etc/passwd")).statusCode).toBe(403);
  });
});

describe("checkPreflight", () => {
  const tw = [[10, 5], [20, 0], [30, 7]];
  test("naive baselines must match TimeWidget exactly", () => {
    expect(checkPreflight({ timewidget: tw, canvas: tw, svg: tw }).ok).toBe(true);
    const bad = checkPreflight({ timewidget: tw, canvas: tw, svg: [[10, 5], [19, 0], [30, 7]] });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/svg/);
  });
  // Review finding: Vega-Lite counts were written but never checked.
  test("Vega-Lite selecting nothing aborts", () => {
    const r = checkPreflight({ timewidget: tw, vegalite: [[0, 0], [0, 0], [0, 0]] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/vegalite/);
  });
  test("Vega-Lite agreement below 0.9 aborts, otherwise it is reported", () => {
    expect(checkPreflight({ timewidget: tw, vegalite: [[1, 1], [2, 0], [3, 1]] }).ok).toBe(false);
    const ok = checkPreflight({ timewidget: tw, vegalite: [[10, 5], [19, 0], [30, 7]] });
    expect(ok.ok).toBe(true);
    expect(ok.vegaliteAgreement).toBeCloseTo(1 - 1 / 72);
  });
});

describe("presentedResult", () => {
  // Review finding: a trace without swap events (renamed event, failed trace)
  // silently fell back to the in-page time, the ~4x optimistic SVG number.
  test("no trace or no swaps is an error, not a fallback", () => {
    expect(presentedResult(null, 300).error).toMatch(/trace/);
    expect(presentedResult({ count: 0, intervalsMs: [], windowMs: 1000 }, 300).error).toMatch(/swap/);
  });
  test("summarises presented intervals and the ratio", () => {
    const r = presentedResult({ count: 4, intervalsMs: [10, 10, 20, 20], windowMs: 60 }, 8);
    expect(r.error).toBeUndefined();
    expect(r.presentedFrames).toBe(4);
    expect(r.presentedRatio).toBe(0.5);
    expect(r.presentedMs.p50).toBe(15);
  });
});
