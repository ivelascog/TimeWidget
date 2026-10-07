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

  const get = (p) =>
    new Promise((resolve, reject) => {
      // Raw path, so "../" reaches the server instead of being normalised.
      const req = http.request(server.url + "/", { path: p }, (res) => {
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
  test("does not list directories or escape the root", async () => {
    expect((await get("/bench/")).statusCode).toBe(404);
    expect((await get("/../../etc/passwd")).statusCode).toBe(403);
  });
});
