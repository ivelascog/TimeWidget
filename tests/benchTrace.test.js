import { presentedFrames } from "../bench/trace.mjs";

const mark = (name, ts) => ({ name, cat: "blink.user_timing", ph: "I", ts });
const swap = (ts) => ({ name: "Display::DrawAndSwap", cat: "viz", ph: "X", ts, dur: 30 });

test("counts swaps inside the measured window and returns their intervals in ms", () => {
  const events = [
    swap(500), // before the window: ignored
    mark("bench-measure-start", 1000),
    swap(11000),
    swap(21000),
    swap(41000),
    mark("bench-measure-end", 45000),
    swap(50000), // after the window: ignored
  ];
  const r = presentedFrames(events);
  expect(r.count).toBe(3);
  // start -> first swap, then swap -> swap
  expect(r.intervalsMs).toEqual([10, 10, 20]);
  expect(r.windowMs).toBe(44);
});

test("no swaps at all is reported, not hidden", () => {
  const r = presentedFrames([mark("bench-measure-start", 0), mark("bench-measure-end", 1000)]);
  expect(r).toEqual({ count: 0, intervalsMs: [], windowMs: 1 });
});

test("missing marks give null", () => {
  expect(presentedFrames([swap(1)])).toBeNull();
});

import { frameStageBusy, frameCosts, pacingCheck } from "../bench/trace.mjs";

// Synthetic trace: GPU process (pid 1) with CrGpuMain + VizCompositorThread,
// renderer (pid 2) with Compositor and two raster workers, and an unrelated
// browser thread that must be ignored.
const meta = [
  { ph: "M", name: "process_name", pid: 1, args: { name: "GPU Process" } },
  { ph: "M", name: "process_name", pid: 2, args: { name: "Renderer" } },
  { ph: "M", name: "process_name", pid: 3, args: { name: "Browser" } },
  { ph: "M", name: "thread_name", pid: 1, tid: 10, args: { name: "CrGpuMain" } },
  { ph: "M", name: "thread_name", pid: 1, tid: 11, args: { name: "VizCompositorThread" } },
  { ph: "M", name: "thread_name", pid: 2, tid: 20, args: { name: "Compositor" } },
  { ph: "M", name: "thread_name", pid: 2, tid: 21, args: { name: "CompositorTileWorker1" } },
  { ph: "M", name: "thread_name", pid: 2, tid: 22, args: { name: "CompositorTileWorker2" } },
  { ph: "M", name: "thread_name", pid: 3, tid: 30, args: { name: "CrBrowserMain" } },
];
const frameMark = (ts) => ({ name: "bench-frame", cat: "blink.user_timing", ph: "I", ts });
const task = (pid, tid, ts, dur, name = "RunTask") => ({ name, ph: "X", pid, tid, ts, dur });

describe("frameStageBusy", () => {
  // Two frame slots: [0, 10 ms) and [10 ms, 20 ms).
  const events = [
    ...meta,
    frameMark(0),
    frameMark(10000),
    mark("bench-measure-end", 20000),
    task(1, 10, 1000, 3000), // GPU 3 ms in slot 0
    task(1, 10, 1500, 1000, "ThreadControllerImpl::RunTask"), // nested: must not double count
    task(1, 10, 9000, 2000), // straddles: 1 ms in slot 0, 1 ms in slot 1
    task(1, 11, 12000, 500), // viz 0.5 ms in slot 1
    task(2, 21, 11000, 4000), // raster worker 1: 4 ms in slot 1
    task(2, 22, 11000, 1000), // raster worker 2 in parallel: stage = busiest worker
    task(3, 30, 0, 20000), // browser main: ignored
  ];

  test("buckets busy time per stage into each frame's slot", () => {
    const r = frameStageBusy(events);
    expect(r.slotsMs).toEqual([10, 10]);
    expect(r.stages.gpuMain).toEqual([4, 1]);
    expect(r.stages.vizCompositor).toEqual([0, 0.5]);
    expect(r.stages.rasterWorkers).toEqual([0, 4]);
    expect(r.stages.rendererCompositor).toEqual([0, 0]);
  });

  test("null without frame marks", () => {
    expect(frameStageBusy(meta)).toBeNull();
  });
});

describe("frameCosts", () => {
  test("each frame costs as much as its slowest stage, and names it", () => {
    const busy = { gpuMain: [4, 1], vizCompositor: [0, 0.5], rasterWorkers: [0, 4], rendererCompositor: [0, 0] };
    const r = frameCosts([2, 3], busy);
    expect(r.costMs).toEqual([4, 4]);
    expect(r.gpuMs).toEqual([4, 1]);
    expect(r.bottleneck).toEqual({ gpuMain: 1, rasterWorkers: 1 });
  });
  test("main thread wins when it is the slowest", () => {
    const busy = { gpuMain: [1], vizCompositor: [0], rasterWorkers: [0], rendererCompositor: [0] };
    expect(frameCosts([3], busy)).toMatchObject({ costMs: [3], bottleneck: { mainThread: 1 } });
  });
});

describe("pacingCheck", () => {
  const busy = (gpu) => ({ gpuMain: gpu, vizCompositor: [0, 0], rasterWorkers: [0, 0], rendererCompositor: [0, 0] });
  test("ok when every stage fits comfortably in its slot and frames are presented", () => {
    expect(pacingCheck({ slotsMs: [10, 10], stages: busy([3, 4]) }, 1).ok).toBe(true);
  });
  test("a stage filling its slot means work spilled into the next frame", () => {
    const r = pacingCheck({ slotsMs: [10, 10], stages: busy([9, 9.5]) }, 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/gap/);
  });
  test("dropped frames mean the pipeline still starved", () => {
    const r = pacingCheck({ slotsMs: [10, 10], stages: busy([3, 4]) }, 0.5);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/presented/);
  });
});
