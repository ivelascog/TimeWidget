// Environment checks and metadata for benchmark runs.
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const run = promisify(execFile);

// Pure: decides whether a run's numbers can be trusted. Software raster makes
// frame time measure the missing GPU (14 vs 60 FPS at 20k lines in the spike);
// a hidden or unfocused page gets its rAF throttled; a page that is not
// cross-origin isolated has 100 µs timers.
export function checkGate(state, { allowSoftwareRaster = false } = {}) {
  const reasons = [];
  if (!allowSoftwareRaster && state.canvas2d !== "enabled") {
    reasons.push(`2d_canvas is ${state.canvas2d}`);
  }
  if (!allowSoftwareRaster && state.gpuCompositing !== "enabled") {
    reasons.push(`gpu_compositing is ${state.gpuCompositing}`);
  }
  if (!state.visible) reasons.push("page not visible");
  if (!state.focused) reasons.push("page not focused");
  if (!state.crossOriginIsolated) reasons.push("page not cross-origin isolated (coarse timers)");
  return { ok: reasons.length === 0, reasons };
}

// Pure: every implementation must answer the same query. The naive baselines
// use TimeWidget's semantics and must match it exactly; Vega-Lite tests points
// rather than segments, so it must agree at least 90% and select something
// (all zeros means the brush never reached Vega's store).
export const VEGALITE_MIN_AGREEMENT = 0.9;

export function checkPreflight(counts) {
  const errors = [];
  const ref = counts.timewidget;
  let vegaliteAgreement = null;
  if (ref) {
    for (const name of ["canvas", "svg"]) {
      if (counts[name] && JSON.stringify(counts[name]) !== JSON.stringify(ref)) {
        errors.push(`${name} selects differently from TimeWidget`);
      }
    }
    if (counts.vegalite) {
      const tw = ref.flat();
      const vl = counts.vegalite.flat();
      const total = tw.reduce((a, b) => a + b, 0);
      const diff = tw.reduce((s, c, i) => s + Math.abs(c - vl[i]), 0);
      vegaliteAgreement = 1 - diff / Math.max(1, total);
      if (!vl.some((c) => c > 0)) errors.push("vegalite selected nothing: the brush did not reach Vega");
      else if (vegaliteAgreement < VEGALITE_MIN_AGREEMENT) {
        errors.push(`vegalite agrees with TimeWidget on only ${(vegaliteAgreement * 100).toFixed(1)}% of selections`);
      }
    }
  }
  return { ok: errors.length === 0, errors, vegaliteAgreement };
}

// The page cannot detect the display refresh rate with vsync off and a forced
// viewport, so ask the OS. Best effort: null when the platform tool is missing.
export async function osRefreshRates() {
  try {
    if (process.platform === "darwin") {
      const js =
        'ObjC.import("AppKit"); const s = $.NSScreen.screens; const r = [];' +
        " for (let i = 0; i < s.count; i++) r.push(Number(s.objectAtIndex(i).maximumFramesPerSecond));" +
        " JSON.stringify(r)";
      const { stdout } = await run("osascript", ["-l", "JavaScript", "-e", js]);
      return JSON.parse(stdout.trim());
    }
    if (process.platform === "win32") {
      const { stdout } = await run("powershell", [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_VideoController | Where-Object CurrentRefreshRate).CurrentRefreshRate -join ','",
      ]);
      return stdout.trim().split(",").filter(Boolean).map(Number);
    }
    const { stdout } = await run("xrandr", ["--current"]);
    return [...stdout.matchAll(/([\d.]+)\*/g)].map((m) => Number(m[1]));
  } catch {
    return null;
  }
}

async function gitInfo() {
  try {
    const sha = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
    const status = (await run("git", ["status", "--porcelain", "--", "src", "bench"])).stdout;
    return { sha, dirty: status.trim() !== "" };
  } catch {
    return { sha: null, dirty: null };
  }
}

function packageVersion(name) {
  try {
    const url = new URL(`../node_modules/${name}/package.json`, import.meta.url);
    return JSON.parse(readFileSync(url)).version;
  } catch {
    return null;
  }
}

export async function gpuStatus(browser) {
  const cdp = await browser.newBrowserCDPSession();
  const info = await cdp.send("SystemInfo.getInfo");
  await cdp.detach();
  const fs = info.gpu.featureStatus || {};
  return {
    canvas2d: fs["2d_canvas"],
    gpuCompositing: fs.gpu_compositing,
    featureStatus: fs,
    devices: info.gpu.devices,
    modelName: info.modelName,
    modelVersion: info.modelVersion,
  };
}

export async function collectEnvironment(browser, page, { argv }) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const inPage = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    dpr: devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    crossOriginIsolated: window.crossOriginIsolated,
  }));
  const cpus = os.cpus();
  return {
    timestamp: new Date().toISOString(),
    argv,
    hostname: os.hostname(),
    os: { platform: process.platform, release: os.release(), version: os.version(), arch: os.arch() },
    cpu: { model: cpus.length ? cpus[0].model : null, cores: cpus.length },
    ramGB: Math.round(os.totalmem() / 2 ** 30),
    loadAvg: os.loadavg(),
    gpu: await gpuStatus(browser),
    refreshRatesHz: await osRefreshRates(),
    browser: { version: browser.version(), userAgent: inPage.userAgent },
    page: {
      forcedDpr: inPage.dpr,
      hardwareConcurrency: inPage.hardwareConcurrency,
      crossOriginIsolated: inPage.crossOriginIsolated,
    },
    versions: {
      node: process.version,
      timewidget: pkg.version,
      playwright: packageVersion("playwright"),
      d3: packageVersion("d3"),
      vega: packageVersion("vega"),
      vegaLite: packageVersion("vega-lite"),
      vegaEmbed: packageVersion("vega-embed"),
    },
    git: await gitInfo(),
  };
}
