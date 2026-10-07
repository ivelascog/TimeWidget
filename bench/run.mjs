#!/usr/bin/env node
// npm run bench — see bench/README.md. Launches a fresh headed Chromium per
// (cell, repetition), with vsync and the frame-rate limit off, and appends one
// JSON line per run so an interrupted session can be resumed.
import { chromium } from "@playwright/test";
import { parseArgs } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";
import { collectEnvironment, gpuStatus, checkGate } from "./env.mjs";
import { buildCells, orderRuns, shouldSkip, pendingRuns, seriesKey, cellKey } from "./plan.mjs";
import { presentedFrames } from "./trace.mjs";
import {
  summarize,
  headlineMs,
  aggregateCell,
  SHEET_COLUMNS,
  toSheetRow,
  thresholdCrossing,
  linearFit,
} from "./stats.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: opt } = parseArgs({
  options: {
    quick: { type: "boolean", default: false },
    reps: { type: "string" },
    adapters: { type: "string" },
    lines: { type: "string" },
    groups: { type: "string" },
    frames: { type: "string", default: "300" },
    warmup: { type: "string", default: "60" },
    seed: { type: "string", default: "1" },
    channel: { type: "string" },
    "allow-software-raster": { type: "boolean", default: false },
    resume: { type: "string" },
    out: { type: "string", default: path.join(ROOT, "bench", "results") },
  },
});

const list = (s, f = Number) => s.split(",").map((x) => f(x.trim()));
const config = opt.quick
  ? {
      adapters: ["timewidget"],
      lines: [1000, 10000, 50000],
      mainPoints: 20,
      sweepLines: 5000,
      sweepPoints: [],
      groups: [1],
      reps: 2,
    }
  : {
      adapters: ["timewidget", "canvas", "svg", "vegalite"],
      lines: [1000, 2000, 5000, 10000, 20000, 50000, 100000],
      mainPoints: 20,
      sweepLines: 5000,
      sweepPoints: [100, 500],
      groups: [1, 3],
      reps: 5,
    };
if (opt.adapters) config.adapters = list(opt.adapters, String);
if (opt.lines) config.lines = list(opt.lines);
if (opt.groups) config.groups = list(opt.groups);
if (opt.reps) config.reps = Number(opt.reps);
const frames = Number(opt.frames);
const warmupFrames = Number(opt.warmup);
const allowSoftwareRaster = opt["allow-software-raster"];

// Vsync off: frame time then measures the widget, not the monitor (a 120 Hz
// and a 60 Hz screen agreed within ~3% in the spike; with vsync on they
// differed 2x).
const BROWSER_ARGS = ["--disable-gpu-vsync", "--disable-frame-rate-limit", "--window-size=1300,950"];

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const outFile = opt.resume || path.join(opt.out, `${os.hostname()}-${stamp}.jsonl`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const readRecords = () =>
  fs.existsSync(outFile)
    ? fs
        .readFileSync(outFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
const write = (record) => fs.appendFileSync(outFile, JSON.stringify(record) + "\n");

async function launch() {
  const browser = await chromium.launch({ headless: false, channel: opt.channel, args: BROWSER_ARGS });
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  return { browser, page };
}

async function openHarness(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.benchCell === "function");
  await page.bringToFront();
}

const pageState = (page) =>
  page.evaluate(() => ({
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
    crossOriginIsolated: window.crossOriginIsolated,
  }));

async function gate(browser, page) {
  return checkGate(Object.assign({}, await gpuStatus(browser), await pageState(page)), { allowSoftwareRaster });
}

async function setup(pageUrl) {
  const { browser, page } = await launch();
  try {
    await openHarness(page, pageUrl);
    const g = await gate(browser, page);
    if (!g.ok) throw new Error("Environment rejected: " + g.reasons.join("; "));
    if (!readRecords().some((r) => r.type === "environment")) {
      const env = await collectEnvironment(browser, page, { argv: process.argv.slice(2) });
      write({ type: "environment", softwareRaster: allowSoftwareRaster, config, frames, warmupFrames, ...env });
    }
    // Every adapter must answer the same query; naive baselines exactly.
    for (const groups of config.groups) {
      const counts = await page.evaluate((o) => window.benchPreflight(o), {
        adapters: config.adapters,
        lines: 1000,
        points: 20,
        groups,
      });
      write({ type: "preflight", groups, counts });
      if (counts.timewidget) {
        for (const name of ["canvas", "svg"]) {
          if (counts[name] && JSON.stringify(counts[name]) !== JSON.stringify(counts.timewidget)) {
            throw new Error(`Preflight: ${name} selects differently from TimeWidget (groups=${groups})`);
          }
        }
      }
    }
    // Discarded warm-up cell: first-run disk and GPU shader caches.
    await page.evaluate((o) => window.benchCell(o), {
      adapter: config.adapters[0],
      lines: config.lines[0],
      points: config.mainPoints,
      groups: 1,
      frames,
      warmupFrames,
    });
  } finally {
    await browser.close();
  }
}

async function runOne(pageUrl, cell, rep) {
  const { browser, page } = await launch();
  try {
    await openHarness(page, pageUrl);
    const g = await gate(browser, page);
    if (!g.ok) return { type: "reject", cell, rep, reasons: g.reasons };
    // Only the swap and user-timing categories: small, and cheap to record.
    await browser.startTracing(page, { categories: ["viz", "blink.user_timing"] });
    const result = await page.evaluate((o) => window.benchCell(o), Object.assign({}, cell, { frames, warmupFrames }));
    const presented = presentedFrames(JSON.parse((await browser.stopTracing()).toString()).traceEvents);
    if (presented) {
      result.presentedMs = summarize(presented.intervalsMs);
      result.presentedFrames = presented.count;
      result.presentedRatio = result.measuredFrames ? presented.count / result.measuredFrames : null;
    }
    if (!result.visible || !result.focused) {
      return { type: "reject", cell, rep, reasons: ["lost visibility or focus during the run"] };
    }
    return Object.assign({ type: "run", cell, rep }, result);
  } finally {
    await browser.close();
  }
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v);
}

function writeSummary() {
  const runs = readRecords().filter((r) => r.type === "run");
  const byCell = new Map();
  for (const r of runs) {
    const k = cellKey(r.cell);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(r);
  }
  const cells = [...byCell.values()]
    .map(aggregateCell)
    .sort((a, b) => seriesKey(a).localeCompare(seriesKey(b)) || a.lines - b.lines);
  const base = outFile.replace(/\.jsonl$/, "");
  const csv = [SHEET_COLUMNS, ...cells.map(toSheetRow)].map((row) => row.map(csvCell).join(",")).join("\n");
  fs.writeFileSync(base + ".csv", csv + "\n");

  const series = new Map();
  for (const c of cells) {
    const k = seriesKey(c);
    if (!series.has(k)) series.set(k, []);
    series.get(k).push(c);
  }
  const scaling = [...series.entries()].map(([k, cs]) => {
    const pts = cs.map((c) => ({ n: c.lines, ms: c.frameMs.p95 }));
    // A slope needs several sizes; the points sweep has one size per series.
    const fit = cs.length >= 3 ? linearFit(cs.map((c) => c.lines * c.points), cs.map((c) => c.frameMs.p50)) : null;
    return {
      series: k,
      n60: thresholdCrossing(pts, 1000 / 60),
      n30: thresholdCrossing(pts, 1000 / 30),
      n100: thresholdCrossing(pts, 100),
      msPer100kPoints: fit ? fit.slope * 1e5 : null,
      r2: fit ? fit.r2 : null,
    };
  });
  fs.writeFileSync(base + ".summary.json", JSON.stringify({ cells, scaling }, null, 2));
  console.log(`wrote ${base}.csv and ${base}.summary.json`);
}

async function main() {
  const server = await startServer(ROOT);
  const pageUrl = `${server.url}/bench/page.html`;
  try {
    await setup(pageUrl);
    const ordered = orderRuns(buildCells(config), config.reps, Number(opt.seed));
    const todo = pendingRuns(
      ordered,
      readRecords().filter((r) => r.type === "run")
    );
    console.log(`${todo.length} runs to do -> ${outFile}`);
    let i = 0;
    for (const { cell, rep } of todo) {
      i++;
      if (shouldSkip(cell, readRecords().filter((r) => r.type === "run"))) {
        write({ type: "skip", cell, rep });
        continue;
      }
      const record = await runOne(pageUrl, cell, rep);
      write(record);
      if (record.type === "reject") {
        console.warn(`[${i}/${todo.length}] REJECTED ${cellKey(cell)} rep ${rep}: ${record.reasons.join("; ")}`);
      } else {
        const f = headlineMs(record);
        const ratio = record.presentedRatio === undefined || record.presentedRatio === null ? "?" : record.presentedRatio.toFixed(2);
        console.log(
          `[${i}/${todo.length}] ${cellKey(cell)} rep ${rep}: p50 ${f.p50.toFixed(2)} ms, p95 ${f.p95.toFixed(2)} ms,` +
            ` presented ${ratio}` + (record.truncated ? " (truncated)" : "")
        );
      }
    }
    writeSummary();
  } finally {
    await server.close();
  }
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
