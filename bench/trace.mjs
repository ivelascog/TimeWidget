// Frames that actually reached the screen, from a Chrome trace recorded with
// the "viz" and "blink.user_timing" categories.
//
// Why: the in-page clock (start of a brush update -> next rAF) only sees the
// main thread. A GPU canvas back-pressures the main thread, so for TimeWidget,
// the canvas baseline and Vega-Lite every measured frame was also presented.
// SVG is rasterised off the main thread: in validation, 120 driver frames at
// 5k series produced only 27 swaps, so its in-page frame time was ~4x too
// optimistic. Display::DrawAndSwap (viz, GPU process) is one per presented frame.
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
