// What the page's own clock cannot see, from a Chrome trace recorded with the
// "blink.user_timing", "viz", "toplevel" and "gpu" categories.
//
// The in-page clock (start of a brush update -> next rAF) times only the main
// thread. Painting continues in other stages (the GPU process above all). For
// TimeWidget, the canvas baseline and Vega-Lite the main thread waits for it;
// naive SVG does not, and with vsync off a main thread faster than the GPU
// starved it: ~90% of frames dropped, and adding 1 ms of work made SVG measure
// 4x *faster*. So the driver paces frames (a short busy-wait gap lets every
// stage finish) and each frame's cost is its slowest stage, measured here.
import { summarize } from "./stats.mjs";

const SWAP = "Display::DrawAndSwap";

export function presentedFrames(events, startMark = "bench-measure-start", endMark = "bench-measure-end") {
  const start = events.find((e) => e.name === startMark);
  const end = events.find((e) => e.name === endMark);
  if (!start || !end) return null;
  const swaps = events
    .filter((e) => e.name === SWAP && e.ts >= start.ts && e.ts <= end.ts)
    .map((e) => e.ts)
    .sort((a, b) => a - b);
  const intervalsMs = [];
  let previous = start.ts;
  for (const ts of swaps) {
    intervalsMs.push((ts - previous) / 1000);
    previous = ts;
  }
  return { count: swaps.length, intervalsMs, windowMs: (end.ts - start.ts) / 1000 };
}

// The run's presented-frame fields, or {error} when the trace cannot vouch for
// the run. A missing trace or zero swaps must not silently fall back to the
// in-page time: that is exactly the number that was ~4x optimistic for SVG.
export function presentedResult(presented, measuredFrames) {
  if (!presented) return { error: "trace has no measurement marks" };
  if (!presented.count) return { error: "trace recorded no swaps (Display::DrawAndSwap)" };
  return {
    presentedMs: summarize(presented.intervalsMs),
    presentedFrames: presented.count,
    presentedRatio: measuredFrames ? presented.count / measuredFrames : null,
  };
}

// Top-level task events; nested ones are merged by the interval union below.
const TASK = /^(RunTask|ThreadControllerImpl::RunTask|ThreadPool_RunTask)$/;

function stageOf(processName, threadName) {
  if (processName.startsWith("GPU")) {
    if (threadName === "CrGpuMain") return "gpuMain";
    if (threadName === "VizCompositorThread") return "vizCompositor";
  }
  if (processName.startsWith("Renderer")) {
    if (threadName === "Compositor") return "rendererCompositor";
    if (/CompositorTileWorker/.test(threadName)) return "rasterWorkers";
  }
  return null;
}

export const STAGES = ["gpuMain", "vizCompositor", "rendererCompositor", "rasterWorkers"];

// Busy ms of each pipeline stage inside each measured frame's slot (from one
// "bench-frame" mark to the next; the last ends at "bench-measure-end").
// Per thread, task intervals are unioned (nesting is not double counted) and
// clipped to the slot; a stage with several threads (raster workers) counts
// as busy as its busiest thread, since they run in parallel.
export function frameStageBusy(events, frameMark = "bench-frame", endMark = "bench-measure-end") {
  const marks = events.filter((e) => e.name === frameMark).map((e) => e.ts).sort((a, b) => a - b);
  const end = events.find((e) => e.name === endMark);
  if (!marks.length || !end) return null;
  const bounds = marks.concat([end.ts]);
  const slots = marks.length;

  const processNames = {};
  const threadNames = {};
  for (const e of events) {
    if (e.ph !== "M") continue;
    if (e.name === "process_name") processNames[e.pid] = e.args.name;
    if (e.name === "thread_name") threadNames[e.pid + ":" + e.tid] = e.args.name;
  }
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== "X" || !e.dur || !TASK.test(e.name)) continue;
    const key = e.pid + ":" + e.tid;
    const stage = stageOf(processNames[e.pid] || "", threadNames[key] || "");
    if (!stage) continue;
    if (!byThread.has(key)) byThread.set(key, { stage, intervals: [] });
    byThread.get(key).intervals.push([e.ts, e.ts + e.dur]);
  }

  const stages = Object.fromEntries(STAGES.map((s) => [s, new Array(slots).fill(0)]));
  for (const { stage, intervals } of byThread.values()) {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push(iv.slice());
    }
    const perSlot = new Array(slots).fill(0);
    for (const [a, b] of merged) {
      for (let i = 0; i < slots; i++) {
        const lo = Math.max(a, bounds[i]);
        const hi = Math.min(b, bounds[i + 1]);
        if (hi > lo) perSlot[i] += (hi - lo) / 1000;
      }
    }
    for (let i = 0; i < slots; i++) stages[stage][i] = Math.max(stages[stage][i], perSlot[i]);
  }
  const slotsMs = [];
  for (let i = 0; i < slots; i++) slotsMs.push((bounds[i + 1] - bounds[i]) / 1000);
  return { slotsMs, stages };
}

// Each frame costs as much as its slowest stage: a paced pipeline cannot run
// faster than that. mainMs is the page's own per-frame clock.
export function frameCosts(mainMs, stages) {
  const costMs = [];
  const bottleneck = {};
  for (let i = 0; i < mainMs.length; i++) {
    let worst = "mainThread";
    let cost = mainMs[i];
    for (const s of STAGES) {
      if (stages[s] && stages[s][i] > cost) {
        cost = stages[s][i];
        worst = s;
      }
    }
    costMs.push(cost);
    bottleneck[worst] = (bottleneck[worst] || 0) + 1;
  }
  return { costMs, gpuMs: stages.gpuMain.slice(0, mainMs.length), bottleneck };
}

// Pacing only works if every stage finished inside its own slot. A stage busy
// for most of a slot means work spilled into the next frame (gap too short);
// dropped frames mean the pipeline still starved.
export const SLOT_SHARE_LIMIT = 0.8;
export const SPILLED_FRAMES_LIMIT = 0.05;
export const PRESENTED_RATIO_LIMIT = 0.95;

export function pacingCheck({ slotsMs, stages }, presentedRatio) {
  if (presentedRatio !== null && presentedRatio !== undefined && presentedRatio < PRESENTED_RATIO_LIMIT) {
    return { ok: false, reason: `only ${(presentedRatio * 100).toFixed(0)}% of frames presented` };
  }
  let spilled = 0;
  for (let i = 0; i < slotsMs.length; i++) {
    if (STAGES.some((s) => stages[s][i] > SLOT_SHARE_LIMIT * slotsMs[i])) spilled++;
  }
  if (spilled > SPILLED_FRAMES_LIMIT * slotsMs.length) {
    return { ok: false, reason: `${spilled} of ${slotsMs.length} frames filled their slot: pacing gap too short` };
  }
  return { ok: true };
}
