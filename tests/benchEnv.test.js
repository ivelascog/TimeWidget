import { checkGate } from "../bench/env.mjs";
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
