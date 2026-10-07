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
